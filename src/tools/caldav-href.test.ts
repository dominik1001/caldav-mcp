import { describe, expect, it } from "vitest";
import { hrefFor, toAbsoluteUrl, toCalendarPath } from "./caldav-href.js";

describe("hrefFor", () => {
	it("builds the .ics href from a calendar URL with trailing slash", () => {
		expect(hrefFor("/f/cal/", "abc")).toBe("/f/cal/abc.ics");
	});

	it("appends a trailing slash when the calendar URL lacks one", () => {
		expect(hrefFor("/f/cal", "abc")).toBe("/f/cal/abc.ics");
	});
});

const calendarPath = "/remote.php/dav/calendars/user/personal/";

describe("toAbsoluteUrl", () => {
	it.each([
		"https://cloud.example.com/remote.php/dav",
		"https://cloud.example.com/remote.php/dav/",
		"https://cloud.example.com",
	])("resolves a server-relative href against base %s", (baseUrl) => {
		expect(toAbsoluteUrl(calendarPath, baseUrl)).toBe(
			`https://cloud.example.com${calendarPath}`
		);
	});

	it("keeps the port of the base URL", () => {
		expect(toAbsoluteUrl("/cal/", "http://localhost:5232/")).toBe(
			"http://localhost:5232/cal/"
		);
	});

	it("drops credentials embedded in the base URL", () => {
		expect(
			toAbsoluteUrl(calendarPath, "https://alice:s3cret@cloud.example.com/")
		).toBe(`https://cloud.example.com${calendarPath}`);
	});

	it("leaves an already absolute href untouched", () => {
		const href = "https://other.example.com/cal/";
		expect(toAbsoluteUrl(href, "https://cloud.example.com")).toBe(href);
	});

	it("leaves the href untouched without a base URL", () => {
		expect(toAbsoluteUrl(calendarPath, undefined)).toBe(calendarPath);
		expect(toAbsoluteUrl(calendarPath, "")).toBe(calendarPath);
	});

	it("leaves an empty href empty", () => {
		expect(toAbsoluteUrl("", "https://cloud.example.com")).toBe("");
	});
});

describe("toCalendarPath", () => {
	const baseUrl = "https://cloud.example.com/remote.php/dav";

	it("turns an absolute URL on the configured server into its path", () => {
		expect(
			toCalendarPath(`https://cloud.example.com${calendarPath}`, baseUrl)
		).toBe(calendarPath);
	});

	it("passes a server-relative path through unchanged", () => {
		expect(toCalendarPath(calendarPath, baseUrl)).toBe(calendarPath);
	});

	it("leaves a URL on another origin untouched", () => {
		for (const url of [
			"https://other.example.com/cal/",
			"http://cloud.example.com/cal/",
			"https://cloud.example.com:8443/cal/",
		]) {
			expect(toCalendarPath(url, baseUrl)).toBe(url);
		}
	});

	it("leaves the input untouched without a base URL", () => {
		const url = `https://cloud.example.com${calendarPath}`;
		expect(toCalendarPath(url, undefined)).toBe(url);
	});

	it("round-trips with toAbsoluteUrl", () => {
		expect(toCalendarPath(toAbsoluteUrl(calendarPath, baseUrl), baseUrl)).toBe(
			calendarPath
		);
	});
});
