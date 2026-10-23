import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import {
	type RecurrenceRuleInput,
	recurrenceRuleSchema,
	toRecurrenceRule,
} from "./recurrence-rule.js";
import { toWholeDayDate } from "./whole-day-date.js";

type CreateEventInput = {
	summary: string;
	start: string;
	end: string;
	wholeDay?: boolean | undefined;
	calendarUrl: string;
	description?: string | undefined;
	location?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
};

export const createEventDefinition = {
	name: "create-event",
	description:
		"Creates an event in the calendar specified by its URL. For all-day events, set `wholeDay` to true. For a single-day all-day event, use `start` and `end` datetimes on the same calendar date; they do not need to be identical timestamps.",
	inputSchema: {
		summary: z.string(),
		start: z
			.string()
			.datetime({ offset: true })
			.describe("Start datetime (ISO 8601)"),
		end: z
			.string()
			.datetime({ offset: true })
			.describe("End datetime (ISO 8601)"),
		wholeDay: z.boolean().optional().describe("Create as a whole-day event"),
		calendarUrl: z.string(),
		description: z.string().optional(),
		location: z.string().optional(),
		recurrenceRule: recurrenceRuleSchema.optional(),
	},
	returns: "The unique ID of the created event",
} as const;

export function registerCreateEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		createEventDefinition.name,
		{
			description: createEventDefinition.description,
			inputSchema: createEventDefinition.inputSchema,
		},
		async (args: CreateEventInput) => {
			const {
				summary,
				start,
				end,
				wholeDay,
				description,
				location,
				recurrenceRule,
			} = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			const event = await client.createEvent(calendarUrl, {
				summary: summary,
				start: wholeDay ? toWholeDayDate(start) : new Date(start),
				end: wholeDay ? toWholeDayDate(end) : new Date(end),
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule, wholeDay),
				}),
			});

			return {
				content: [{ type: "text", text: event.uid }],
			};
		},
	);
}
