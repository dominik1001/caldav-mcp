import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	storedEndToWholeDayDate,
	storedStartToWholeDayDate,
	toWholeDayDate,
} from "./whole-day-date.js";

describe("toWholeDayDate", () => {
	test("keeps the calendar date for a UTC input", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00.000Z").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z",
		);
	});

	test("keeps the calendar date for a positive offset (Asia/Seoul, +09:00)", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00+09:00").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z",
		);
	});

	test("keeps the calendar date for a negative offset (-07:00)", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00-07:00").toISOString()).toBe(
			"2026-09-30T00:00:00.000Z",
		);
	});

	test("keeps the calendar date at a month boundary (Jan 31)", () => {
		expect(toWholeDayDate("2027-01-31T00:00:00+09:00").toISOString()).toBe(
			"2027-01-31T00:00:00.000Z",
		);
	});

	test("keeps the calendar date on a leap day (Feb 29)", () => {
		expect(toWholeDayDate("2028-02-29T00:00:00+09:00").toISOString()).toBe(
			"2028-02-29T00:00:00.000Z",
		);
	});
});

describe("stored whole-day dates", () => {
	// ical.js hands a VALUE=DATE back as local midnight; east of UTC that is
	// the previous day in UTC.
	beforeEach(() => {
		vi.stubEnv("TZ", "Europe/Berlin");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("storedStartToWholeDayDate anchors the local day at UTC midnight", () => {
		const start = new Date(2026, 7, 18);
		expect(start.toISOString()).toBe("2026-08-17T22:00:00.000Z");
		expect(storedStartToWholeDayDate(start).toISOString()).toBe(
			"2026-08-18T00:00:00.000Z",
		);
	});

	test("storedEndToWholeDayDate turns the exclusive DTEND into the last day", () => {
		expect(storedEndToWholeDayDate(new Date(2026, 7, 23)).toISOString()).toBe(
			"2026-08-22T00:00:00.000Z",
		);
	});

	test("storedEndToWholeDayDate steps back across a month boundary", () => {
		expect(storedEndToWholeDayDate(new Date(2026, 9, 1)).toISOString()).toBe(
			"2026-09-30T00:00:00.000Z",
		);
	});
});
