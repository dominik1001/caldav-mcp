import type { Event } from "ts-caldav";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	carryOverWholeDayDates,
	inclusiveEndToWholeDayDate,
	localDayToWholeDayDate,
	toWholeDayDate,
} from "./whole-day-date.js";

describe("toWholeDayDate", () => {
	test("keeps the calendar date for a UTC input", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00.000Z").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z"
		);
	});

	test("keeps the calendar date for a positive offset (Asia/Seoul, +09:00)", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00+09:00").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z"
		);
	});

	test("keeps the calendar date for a negative offset (-07:00)", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00-07:00").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z"
		);
	});

	test("keeps the calendar date at a month boundary (Jan 31)", () => {
		expect(toWholeDayDate("2027-01-31T00:00:00+09:00").toISOString()).toBe(
			"2027-01-31T00:00:00.000Z"
		);
	});

	test("keeps the calendar date on a leap day (Feb 29)", () => {
		expect(toWholeDayDate("2028-02-29T00:00:00+09:00").toISOString()).toBe(
			"2028-02-29T00:00:00.000Z"
		);
	});
});

describe("stored whole-day dates", () => {
	// ical.js hands a VALUE=DATE back as local midnight; east of UTC that is
	// the previous day in UTC. Pinned here rather than relying on the global
	// TZ in vitest.config.ts, so these tests keep exercising the shift even if
	// that default changes.
	beforeEach(() => {
		vi.stubEnv("TZ", "Europe/Berlin");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("localDayToWholeDayDate anchors the local day at UTC midnight", () => {
		const start = new Date(2026, 7, 18);
		expect(start.toISOString()).toBe("2026-08-17T22:00:00.000Z");
		expect(localDayToWholeDayDate(start).toISOString()).toBe(
			"2026-08-18T00:00:00.000Z"
		);
	});

	test("localDayToWholeDayDate takes the local day of a timed instant", () => {
		// 00:30 in Berlin, still the 17th in UTC.
		const timed = new Date("2026-08-18T00:30:00+02:00");
		expect(localDayToWholeDayDate(timed).toISOString()).toBe(
			"2026-08-18T00:00:00.000Z"
		);
	});

	test("inclusiveEndToWholeDayDate turns the exclusive DTEND into the last day", () => {
		expect(
			inclusiveEndToWholeDayDate(
				new Date(2026, 7, 23),
				new Date(2026, 7, 18)
			).toISOString()
		).toBe("2026-08-22T00:00:00.000Z");
	});

	test("inclusiveEndToWholeDayDate steps back across a month boundary", () => {
		expect(
			inclusiveEndToWholeDayDate(
				new Date(2026, 9, 1),
				new Date(2026, 8, 30)
			).toISOString()
		).toBe("2026-09-30T00:00:00.000Z");
	});

	test("inclusiveEndToWholeDayDate keeps a timed end on its own day", () => {
		expect(
			inclusiveEndToWholeDayDate(
				new Date("2026-08-18T01:30:00+02:00"),
				new Date("2026-08-18T00:30:00+02:00")
			).toISOString()
		).toBe("2026-08-18T00:00:00.000Z");
	});

	test("inclusiveEndToWholeDayDate never ends before the start (DTEND equal to DTSTART)", () => {
		const day = new Date(2026, 7, 18);
		expect(inclusiveEndToWholeDayDate(day, day).toISOString()).toBe(
			"2026-08-18T00:00:00.000Z"
		);
	});

	test("carryOverWholeDayDates reshapes every date ts-caldav writes", () => {
		const existing: Event = {
			end: new Date(2026, 9, 1),
			etag: '"1"',
			exdates: [new Date(2027, 8, 30)],
			href: "/f/test-calendar/yearly-1.ics",
			rdates: [new Date(2027, 9, 2)],
			recurrenceId: new Date(2028, 8, 30),
			recurrenceRule: { freq: "YEARLY", until: new Date(2030, 8, 30) },
			start: new Date(2026, 8, 30),
			summary: "Yearly",
			uid: "yearly-1",
			wholeDay: true,
		};

		const carried = carryOverWholeDayDates(existing);

		expect(carried.start?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(carried.end?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(carried.recurrenceRule).toEqual({
			freq: "YEARLY",
			until: new Date("2030-09-30T00:00:00.000Z"),
		});
		expect(carried.exdates).toEqual([new Date("2027-09-30T00:00:00.000Z")]);
		expect(carried.rdates).toEqual([new Date("2027-10-02T00:00:00.000Z")]);
		expect(carried.recurrenceId).toEqual(new Date("2028-09-30T00:00:00.000Z"));
	});

	test("carryOverWholeDayDates leaves out fields the event doesn't have", () => {
		const carried = carryOverWholeDayDates({
			etag: '"1"',
			href: "/f/test-calendar/one-off.ics",
			start: new Date(2026, 7, 18),
			summary: "One-off",
			uid: "one-off",
			wholeDay: true,
		});

		expect(Object.keys(carried)).toEqual(["start"]);
	});
});
