import type { Alarm } from "ts-caldav";
import { z } from "zod";

export const reminderBeforeSchema = z
	.string()
	.regex(/^P(?!$)(\d+W|(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?)$/)
	.describe(
		"Display reminder before the event start, as ISO 8601 duration (e.g. P3D, PT30M)",
	);

export const transparentSchema = z
	.boolean()
	.describe("Mark the event as free (true) or busy (false)");

export function toAlarm(reminderBefore: string): Alarm {
	return {
		action: "DISPLAY",
		trigger: `-${reminderBefore}`,
		description: "Reminder",
	};
}

export function toTransp(transparent: boolean): string {
	return transparent ? "TRANSPARENT" : "OPAQUE";
}
