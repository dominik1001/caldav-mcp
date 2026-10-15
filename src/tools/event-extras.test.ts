import { describe, expect, test } from "vitest";
import { reminderBeforeSchema, toAlarm } from "./event-extras.js";

describe("reminderBeforeSchema", () => {
	test.each(["P3D", "PT1H", "PT30M", "P1DT12H", "P2W"])("accepts %s", (v) => {
		expect(reminderBeforeSchema.safeParse(v).success).toBe(true);
	});

	test.each(["P", "PT", "P1DT", "3D", "-P3D", "1 hour"])("rejects %s", (v) => {
		expect(reminderBeforeSchema.safeParse(v).success).toBe(false);
	});
});

describe("toAlarm", () => {
	test("builds a DISPLAY alarm with a negative trigger and a description", () => {
		expect(toAlarm("P3D")).toEqual({
			action: "DISPLAY",
			trigger: "-P3D",
			description: "Reminder",
		});
	});
});
