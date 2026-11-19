import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { hrefFor, toCalendarPath } from "./caldav-href.js";
import {
	reminderBeforeSchema,
	transparentSchema,
	updatedAlarms,
	updatedCustomFields,
} from "./event-extras.js";
import { recurrenceRuleSchema, toRecurrenceRule } from "./recurrence-rule.js";
import { carryOverWholeDayDates, toWholeDayDate } from "./whole-day-date.js";

type UpdateEventInput = z.infer<
	z.ZodObject<typeof updateEventDefinition.inputSchema>
>;

export const updateEventDefinition = {
	description:
		"Updates an existing event in the calendar specified by its URL. Only provided fields are changed. For a one-day full-day event, set `wholeDay` to true and set `start` and `end` to the same calendar day.",
	inputSchema: {
		calendarUrl: z.string(),
		description: z.string().optional(),
		end: z.string().datetime({ offset: true }).optional(),
		location: z.string().optional(),
		recurrenceRule: recurrenceRuleSchema.optional(),
		reminderBefore: reminderBeforeSchema
			.nullable()
			.optional()
			.describe(
				"Display reminder before the event start, as ISO 8601 duration in weeks, days, hours, minutes or seconds (e.g. P3D, PT30M). Replaces the event's existing display reminders; email and audio reminders are kept. Pass null to remove the display reminders."
			),
		start: z.string().datetime({ offset: true }).optional(),
		summary: z.string().optional(),
		transparent: transparentSchema
			.nullable()
			.optional()
			.describe(
				"Mark the event as free (true) or busy (false). Pass null to clear the free/busy status."
			),
		uid: z
			.string()
			.describe(
				"Unique identifier of the event to update (obtained from list-events)"
			),
		wholeDay: z
			.boolean()
			.optional()
			.describe("Update whether this is a whole-day event"),
	},
	name: "update-event",
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
				summary,
				start,
				end,
				wholeDay,
				description,
				location,
				recurrenceRule,
				reminderBefore,
				transparent,
			} = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);

			const href = hrefFor(calendarUrl, uid);

			const [existing] = await client.getEventsByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Event not found: ${uid}`);
			}

			const effectiveWholeDay = wholeDay ?? existing.wholeDay;
			const alarms = updatedAlarms(
				existing.alarms,
				reminderBefore,
				summary ?? existing.summary
			);
			const customFields = updatedCustomFields(
				existing.customFields,
				transparent
			);

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
				...(alarms !== undefined && { alarms }),
				...(customFields !== undefined && { customFields }),
			});

			return {
				content: [{ text: updated.uid, type: "text" }],
			};
		}
	);
}
