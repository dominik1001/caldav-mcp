import type { Alarm } from "ts-caldav";
import { z } from "zod";

const DURATION = /^P(?!$)(\d+W|(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?)$/;
const NON_ZERO = /[1-9]/;

export const reminderBeforeSchema = z
	.string()
	.regex(DURATION, {
		message:
			"Use weeks, days, hours, minutes or seconds, e.g. P4W, P3D, PT30M. Months and years are not supported.",
	})
	.regex(NON_ZERO, {
		message: "A reminder has to be before the event start, not zero.",
	});

export const transparentSchema = z.boolean();

const fallbackText = (summary: string) => summary || "Reminder";

export function toAlarm(reminderBefore: string, summary: string): Alarm {
	return {
		action: "DISPLAY",
		description: fallbackText(summary),
		trigger: `-${reminderBefore}`,
	};
}

export function toTransp(transparent: boolean): string {
	return transparent ? "TRANSPARENT" : "OPAQUE";
}

export function updatedAlarms(
	existing: Alarm[] | undefined,
	reminderBefore: string | null | undefined,
	summary: string
): Alarm[] | undefined {
	if (existing === undefined && reminderBefore === undefined) {
		return;
	}
	const current = existing ?? [];
	const kept =
		reminderBefore === undefined
			? current
			: current.filter((alarm) => alarm.action !== "DISPLAY");
	const alarms = reminderBefore
		? [...kept, toAlarm(reminderBefore, summary)]
		: kept;
	return alarms.map((alarm) =>
		alarm.action === "DISPLAY" && !alarm.description
			? { ...alarm, description: fallbackText(summary) }
			: alarm
	);
}

export function updatedCustomFields(
	existing: Record<string, string | string[]> | undefined,
	transparent: boolean | null | undefined
): Record<string, string | string[]> | undefined {
	if (transparent === undefined) {
		return;
	}
	const others = Object.entries(existing ?? {}).filter(
		([key]) => key !== "transp"
	);
	return Object.fromEntries(
		transparent === null
			? others
			: [...others, ["transp", toTransp(transparent)]]
	);
}

export function readTransparent(
	customFields: Record<string, string | string[]> | undefined
): boolean | undefined {
	const transp = customFields?.transp;
	if (typeof transp !== "string") {
		return;
	}
	return transp.toUpperCase() === "TRANSPARENT";
}
