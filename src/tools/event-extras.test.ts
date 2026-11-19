import type { Alarm } from "ts-caldav";
import { describe, expect, test } from "vitest";
import {
	readTransparent,
	reminderBeforeSchema,
	toAlarm,
	updatedAlarms,
} from "./event-extras.js";

describe("reminderBeforeSchema", () => {
	test.each(["P3D", "PT1H", "PT30M", "P1DT12H", "P2W", "P10D"])(
		"accepts %s",
		(v) => {
			expect(reminderBeforeSchema.safeParse(v).success).toBe(true);
		}
	);

	test.each(["P", "PT", "P1DT", "3D", "-P3D", "1 hour"])("rejects %s", (v) => {
		expect(reminderBeforeSchema.safeParse(v).success).toBe(false);
	});

	test.each(["P0D", "PT0S", "P0W", "PT0M"])(
		"rejects the zero duration %s",
		(v) => {
			expect(reminderBeforeSchema.safeParse(v).success).toBe(false);
		}
	);

	test.each(["P1M", "P1Y"])("says which units work for %s", (v) => {
		const result = reminderBeforeSchema.safeParse(v);
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toContain("P4W, P3D, PT30M");
	});
});

describe("toAlarm", () => {
	test("builds a DISPLAY alarm with a negative trigger and the event summary", () => {
		expect(toAlarm("P3D", "Bazaar")).toEqual({
			action: "DISPLAY",
			description: "Bazaar",
			trigger: "-P3D",
		});
	});

	test("falls back to a fixed text for an empty summary", () => {
		expect(toAlarm("P3D", "").description).toBe("Reminder");
	});
});

describe("updatedAlarms", () => {
	const display: Alarm = { action: "DISPLAY", trigger: "-PT10M" };

	test("gives a display alarm without a description the summary", () => {
		expect(updatedAlarms([display], undefined, "Trip")).toEqual([
			{ ...display, description: "Trip" },
		]);
	});

	test("changes nothing without alarms and without a reminder", () => {
		expect(updatedAlarms(undefined, undefined, "Trip")).toBeUndefined();
	});
});

describe("readTransparent", () => {
	test("reads TRANSP", () => {
		expect(readTransparent({ transp: "TRANSPARENT" })).toBe(true);
		expect(readTransparent({ transp: "OPAQUE" })).toBe(false);
		expect(readTransparent({})).toBeUndefined();
	});
});
