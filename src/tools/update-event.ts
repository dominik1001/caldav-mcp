import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { hrefFor } from "./caldav-href.js";
import {
	type RecurrenceRuleInput,
	recurrenceRuleSchema,
	toRecurrenceRule,
} from "./recurrence-rule.js";
import { carryOverWholeDayDates, toWholeDayDate } from "./whole-day-date.js";

type UpdateEventInput = {
	uid: string;
	calendarUrl: string;
	summary?: string | undefined;
	start?: string | undefined;
	end?: string | undefined;
	wholeDay?: boolean | undefined;
	description?: string | undefined;
	location?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
};

export const updateEventDefinition = {
	name: "update-event",
	description:
		"Updates an existing event in the calendar specified by its URL. Only provided fields are changed. For a one-day full-day event, set `wholeDay` to true and set `start` and `end` to the same calendar day.",
	inputSchema: {
		uid: z
			.string()
			.describe(
				"Unique identifier of the event to update (obtained from list-events)",
			),
		calendarUrl: z.string(),
		summary: z.string().optional(),
		start: z.string().datetime({ offset: true }).optional(),
		end: z.string().datetime({ offset: true }).optional(),
		wholeDay: z
			.boolean()
			.optional()
			.describe("Update whether this is a whole-day event"),
		description: z.string().optional(),
		location: z.string().optional(),
		recurrenceRule: recurrenceRuleSchema.optional(),
	},
	returns: "The unique ID of the updated event",
} as const;

export function registerUpdateEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		updateEventDefinition.name,
		{
			description: updateEventDefinition.description,
			inputSchema: updateEventDefinition.inputSchema,
		},
		async (args: UpdateEventInput) => {
			const {
				uid,
				calendarUrl,
				summary,
				start,
				end,
				wholeDay,
				description,
				location,
				recurrenceRule,
			} = args;

			const href = hrefFor(calendarUrl, uid);

			const [existing] = await client.getEventsByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Event not found: ${uid}`);
			}

			const effectiveWholeDay = wholeDay ?? existing.wholeDay;

			const updated = await client.updateEvent(calendarUrl, {
				...existing,
				// Dates the caller doesn't pass are carried over; reshape them so the
				// writer stores the same days. Explicit values below override these.
				...(effectiveWholeDay && carryOverWholeDayDates(existing)),
				...(summary !== undefined && { summary }),
				...(start !== undefined && {
					start: effectiveWholeDay ? toWholeDayDate(start) : new Date(start),
				}),
				...(end !== undefined && {
					end: effectiveWholeDay ? toWholeDayDate(end) : new Date(end),
				}),
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule, effectiveWholeDay),
				}),
			});

			return {
				content: [{ type: "text", text: updated.uid }],
			};
		},
	);
}
