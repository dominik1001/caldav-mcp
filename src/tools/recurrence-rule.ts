import type { RecurrenceRule } from "ts-caldav";
import { z } from "zod";
import { toWholeDayDate } from "./whole-day-date.js";

export interface RecurrenceRuleInput {
	byday?: string[] | undefined;
	bymonth?: number[] | undefined;
	bymonthday?: number[] | undefined;
	count?: number | undefined;
	freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | undefined;
	interval?: number | undefined;
	until?: string | undefined;
}

export function toRecurrenceRule(
	r: RecurrenceRuleInput,
	wholeDay?: boolean
): RecurrenceRule {
	const out: RecurrenceRule = {};
	if (r.freq !== undefined) {
		out.freq = r.freq;
	}
	if (r.interval !== undefined) {
		out.interval = r.interval;
	}
	if (r.count !== undefined) {
		out.count = r.count;
	}
	if (r.until !== undefined) {
		out.until = wholeDay ? toWholeDayDate(r.until) : new Date(r.until);
	}
	if (r.byday !== undefined) {
		out.byday = r.byday;
	}
	if (r.bymonthday !== undefined) {
		out.bymonthday = r.bymonthday;
	}
	if (r.bymonth !== undefined) {
		out.bymonth = r.bymonth;
	}
	return out;
}

export const recurrenceRuleSchema = z.object({
	byday: z.array(z.string()).optional(), // e.g. ["MO", "TU"]
	bymonth: z.array(z.number()).optional(),
	bymonthday: z.array(z.number()).optional(),
	count: z.number().optional(),
	freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
	interval: z.number().optional(),
	until: z.string().datetime({ offset: true }).optional(), // ISO 8601 string
});
