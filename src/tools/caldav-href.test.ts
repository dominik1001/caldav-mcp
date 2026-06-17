import { describe, expect, test } from "vitest";
import { hrefFor } from "./caldav-href.js";

describe("hrefFor", () => {
	test("builds the .ics href from a calendar URL with trailing slash", () => {
		expect(hrefFor("/f/cal/", "abc")).toBe("/f/cal/abc.ics");
	});

	test("appends a trailing slash when the calendar URL lacks one", () => {
		expect(hrefFor("/f/cal", "abc")).toBe("/f/cal/abc.ics");
	});
});
