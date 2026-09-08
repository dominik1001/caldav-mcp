import { describe, expect, test } from "vitest";
import { toWholeDayDate } from "./whole-day-date.js";

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

	test("keeps the calendar date at a month boundary (Sep 30)", () => {
		expect(toWholeDayDate("2026-09-30T00:00:00+09:00").toISOString()).toBe(
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
