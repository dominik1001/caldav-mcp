import type { Event } from "ts-caldav";
import { describe, expect, test } from "vitest";
import {
	expandEvents,
	occurrencesWithin,
	toOccurrenceKey,
} from "./recurrence.js";

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

describe("toOccurrenceKey", () => {
	test("accepts the shape ts-caldav hands over", () => {
		expect(toOccurrenceKey("2026-08-21T14:30:00", false)).toBe(
			"2026-08-21T14:30:00",
		);
	});

	test("accepts the bare iCalendar form", () => {
		expect(toOccurrenceKey("20260821T143000", false)).toBe(
			"2026-08-21T14:30:00",
		);
		expect(toOccurrenceKey("20260821T143000Z", false)).toBe(
			"2026-08-21T14:30:00",
		);
	});

	test("reduces to the day for a whole-day series", () => {
		expect(toOccurrenceKey("2026-08-21T00:00:00", true)).toBe("2026-08-21");
		expect(toOccurrenceKey("20260821", true)).toBe("2026-08-21");
	});

	test("returns nothing for something unparseable", () => {
		expect(toOccurrenceKey("next tuesday", false)).toBeUndefined();
	});
});

describe("occurrencesWithin robustness", () => {
	test("skips the slot an override stands in for", () => {
		// The master recurs every Friday at 14:30 Berlin time.
		const master = makeEvent({
			start: new Date("2026-08-14T12:30:00Z"),
			recurrenceRule: { freq: "WEEKLY", byday: ["FR"] },
		});
		const window: [Date, Date] = [
			new Date("2026-08-16T22:00:00Z"),
			new Date("2026-08-23T22:00:00Z"),
		];

		expect(iso(occurrencesWithin(master, ...window))).toEqual([
			"2026-08-21T12:30:00.000Z",
		]);
		expect(
			occurrencesWithin(master, ...window, new Set(["2026-08-21T14:30:00"])),
		).toEqual([]);
	});

	test("reaches a present-day window from a series that began decades ago", () => {
		const ancient = makeEvent({
			start: new Date("1990-01-01T09:00:00Z"),
			recurrenceRule: { freq: "DAILY" },
		});
		const hits = occurrencesWithin(
			ancient,
			new Date("2026-08-17T00:00:00Z"),
			new Date("2026-08-20T00:00:00Z"),
		);
		expect(hits).toHaveLength(3);
	});

	test("survives a time zone identifier that Intl rejects", () => {
		// Exchange and older clients emit Windows zone names.
		const exchange = makeEvent({
			start: new Date("2026-08-21T12:30:00Z"),
			startTzid: "W. Europe Standard Time",
			recurrenceRule: { freq: "WEEKLY", byday: ["FR"] },
		});
		expect(() =>
			occurrencesWithin(
				exchange,
				new Date("2026-08-16T22:00:00Z"),
				new Date("2026-08-23T22:00:00Z"),
			),
		).not.toThrow();
	});
});

describe("seeding near the window", () => {
	// The seed jump skips whole periods. If it landed on the wrong phase, an
	// interval series would come back on the wrong days rather than not at all,
	// so these pin the dates and not just the count.
	test("keeps the phase of a four-weekly series across decades", () => {
		const event = makeEvent({
			start: new Date("1990-01-05T12:30:00Z"), // a Friday
			recurrenceRule: { freq: "WEEKLY", interval: 4, byday: ["FR"] },
		});
		// Checked against a full walk from 1990 with no seed jump: the phase lands
		// on 28 August, not on the 21st. The start is 13:30 Berlin time in winter,
		// so 36 years later it is still 13:30 there, which is 11:30 UTC in summer.
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-23T22:00:00Z"),
					new Date("2026-08-30T22:00:00Z"),
				),
			),
		).toEqual(["2026-08-28T11:30:00.000Z"]);
		// The neighbouring week belongs to another phase and must stay empty.
		expect(
			occurrencesWithin(
				event,
				new Date("2026-08-16T22:00:00Z"),
				new Date("2026-08-23T22:00:00Z"),
			),
		).toEqual([]);
	});

	test("does not skip ahead of a series bounded by COUNT", () => {
		const event = makeEvent({
			start: new Date("2026-08-03T12:30:00Z"),
			recurrenceRule: { freq: "DAILY", count: 3 },
		});
		expect(
			occurrencesWithin(
				event,
				new Date("2026-08-16T22:00:00Z"),
				new Date("2026-08-23T22:00:00Z"),
			),
		).toEqual([]);
		expect(
			iso(
				occurrencesWithin(
					event,
					new Date("2026-08-02T22:00:00Z"),
					new Date("2026-08-09T22:00:00Z"),
				),
			),
		).toHaveLength(3);
	});

	test("accepts the numeric WKST that ts-caldav hands over", () => {
		const event = makeEvent({
			start: new Date("2026-05-29T12:30:00Z"),
			recurrenceRule: {
				freq: "WEEKLY",
				interval: 4,
				wkst: "2",
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
	});
});

describe("expandEvents", () => {
	const master = makeEvent({
		start: new Date("2026-08-14T12:30:00Z"),
		recurrenceRule: { freq: "WEEKLY", byday: ["FR"] },
	});
	const override = makeEvent({
		uid: "test-uid",
		start: new Date("2026-08-21T15:00:00Z"),
		customFields: { "recurrence-id": "2026-08-21T14:30:00" },
	});
	const window: [Date, Date] = [
		new Date("2026-08-16T22:00:00Z"),
		new Date("2026-08-23T22:00:00Z"),
	];

	test("reports a moved occurrence once, at its new time", () => {
		const out = expandEvents([master, override], ...window);
		expect(iso(out.map((o) => o.start))).toEqual(["2026-08-21T15:00:00.000Z"]);
	});

	test("identifies a replacement by the slot it stands in for", () => {
		const [only] = expandEvents([master, override], ...window);
		expect(only?.key).toBe("2026-08-21T14:30:00");
		expect(only?.fromSeries).toBe(true);
	});

	test("gives a plain event its own slot as key", () => {
		const plain = makeEvent({ start: new Date("2026-08-18T09:00:00Z") });
		const [only] = expandEvents([plain], ...window);
		expect(only?.key).toBe("2026-08-18T11:00:00");
		expect(only?.fromSeries).toBe(false);
	});

	test("returns occurrences oldest first across events", () => {
		const other = makeEvent({
			uid: "other",
			start: new Date("2026-08-17T08:00:00Z"),
		});
		const out = expandEvents([master, override, other], ...window);
		expect(iso(out.map((o) => o.start))).toEqual([
			"2026-08-17T08:00:00.000Z",
			"2026-08-21T15:00:00.000Z",
		]);
	});
});

describe("expandEvents with malformed input", () => {
	test("does not treat an event with its own rule as a replacement", () => {
		// RFC 5545 forbids the combination, but the point of this module is
		// surviving what a server actually sends. Honouring the RECURRENCE-ID
		// here would stamp every expanded occurrence with the same key.
		const broken = makeEvent({
			start: new Date("2026-08-17T12:30:00Z"),
			recurrenceRule: { freq: "DAILY" },
			customFields: { "recurrence-id": "2026-08-21T14:30:00" },
		});
		const out = expandEvents(
			[broken],
			new Date("2026-08-16T22:00:00Z"),
			new Date("2026-08-20T22:00:00Z"),
		);
		const keys = out.map((o) => o.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
