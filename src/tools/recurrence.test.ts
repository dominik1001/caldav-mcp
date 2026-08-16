import type { Event } from "ts-caldav";
import { describe, expect, test } from "vitest";
import { occurrencesWithin, toRRuleString } from "./recurrence.js";

function makeEvent(overrides: Partial<Event> & Pick<Event, "start">): Event {
	return {
		uid: "test-uid",
		summary: "Test",
		end: new Date(overrides.start.getTime() + 60 * 60 * 1000),
		etag: "etag",
		href: "/cal/test.ics",
		startTzid: "Europe/Berlin",
		...overrides,
	} as Event;
}

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("toRRuleString", () => {
	test("keeps only the parts that are set", () => {
		expect(toRRuleString({ freq: "WEEKLY", byday: ["TU", "TH"] })).toBe(
			"FREQ=WEEKLY;BYDAY=TU,TH",
		);
	});

	test("translates the numeric WKST that ts-caldav hands over", () => {
		// ts-caldav stringifies ical.js' weekday number, so Monday arrives as "2".
		expect(toRRuleString({ freq: "WEEKLY", interval: 4, wkst: "2" })).toBe(
			"FREQ=WEEKLY;INTERVAL=4;WKST=MO",
		);
		expect(toRRuleString({ freq: "WEEKLY", wkst: "1" })).toBe(
			"FREQ=WEEKLY;WKST=SU",
		);
	});

	test("drops a WKST it cannot make sense of", () => {
		expect(toRRuleString({ freq: "WEEKLY", wkst: "nonsense" })).toBe(
			"FREQ=WEEKLY",
		);
	});

	test("renders UNTIL as a UTC timestamp", () => {
		expect(
			toRRuleString({
				freq: "WEEKLY",
				interval: 4,
				wkst: "MO",
				byday: ["FR"],
				until: new Date("2027-05-30T12:30:00Z"),
			}),
		).toBe("FREQ=WEEKLY;INTERVAL=4;UNTIL=20270530T123000Z;WKST=MO;BYDAY=FR");
	});
});

describe("occurrencesWithin", () => {
	test("returns a single event only when it falls inside the window", () => {
		const event = makeEvent({ start: new Date("2026-08-17T12:30:00Z") });
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-16T22:00:00Z"),
					new Date("2026-08-23T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-17T12:30:00.000Z"]);
		expect(
			occurrencesWithin(
				event,
				new Date("2026-09-01T00:00:00Z"),
				new Date("2026-09-08T00:00:00Z"),
			),
		).toEqual([]);
	});

	test("expands a weekly series that started years earlier", () => {
		// The master DTSTART lies in 2024; a query for 2026 must not echo it back.
		const event = makeEvent({
			start: new Date("2024-09-10T12:00:00Z"),
			recurrenceRule: { freq: "WEEKLY", byday: ["TU", "TH"] },
		});
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-16T22:00:00Z"),
					new Date("2026-08-23T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-18T12:00:00.000Z", "2026-08-20T12:00:00.000Z"]);
	});

	test("keeps the local clock time across a daylight saving change", () => {
		// 14:00 in Berlin is 12:00Z in summer but 13:00Z in winter.
		const event = makeEvent({
			start: new Date("2024-09-10T12:00:00Z"),
			recurrenceRule: { freq: "WEEKLY", byday: ["TU", "TH"] },
		});
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-12-21T00:00:00Z"),
					new Date("2026-12-25T00:00:00Z"),
				),
			),
		).toEqual(["2026-12-22T13:00:00.000Z", "2026-12-24T13:00:00.000Z"]);
	});

	test("honours INTERVAL and UNTIL", () => {
		const event = makeEvent({
			start: new Date("2026-05-29T12:30:00Z"),
			recurrenceRule: {
				freq: "WEEKLY",
				interval: 4,
				wkst: "MO",
				byday: ["FR"],
				until: new Date("2027-05-30T12:30:00Z"),
			},
		});
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-16T22:00:00Z"),
					new Date("2026-08-23T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-21T12:30:00.000Z"]);
		expect(
			occurrencesWithin(
				event,
				new Date("2027-08-01T00:00:00Z"),
				new Date("2027-08-08T00:00:00Z"),
			),
		).toEqual([]);
	});

	test("drops occurrences listed in EXDATE", () => {
		const event = makeEvent({
			start: new Date("2024-09-10T12:00:00Z"),
			recurrenceRule: { freq: "WEEKLY", byday: ["TU", "TH"] },
			customFields: { exdate: "20260818T140000" },
		});
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-16T22:00:00Z"),
					new Date("2026-08-23T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-20T12:00:00.000Z"]);
	});

	test("keeps a yearly whole-day event on its own date", () => {
		// A DTSTART;VALUE=DATE arrives from ical.js as *local* midnight and
		// carries no TZID, so reading it as UTC would move the birthday a day.
		const birthday = makeEvent({
			start: new Date(1971, 6, 5),
			wholeDay: true,
			startTzid: undefined,
			recurrenceRule: { freq: "YEARLY" },
		});
		expect(
			occurrencesWithin(birthday, new Date(2026, 7, 17), new Date(2026, 7, 24)),
		).toEqual([]);
		expect(
			iso(
				occurrencesWithin(
					birthday,
					new Date(2026, 6, 1),
					new Date(2026, 6, 31),
				),
			),
		).toEqual([new Date(2026, 6, 5).toISOString()]);
	});

	test("falls back to the master when the rule carries no FREQ", () => {
		const event = makeEvent({
			start: new Date("2026-08-18T12:00:00Z"),
			recurrenceRule: { byday: ["TU"] },
		});
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-16T22:00:00Z"),
					new Date("2026-08-23T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-18T12:00:00.000Z"]);
	});
});
