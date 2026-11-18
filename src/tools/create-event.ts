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

interface CreateEventInput {
	calendarUrl: string;
	description?: string | undefined;
	end: string;
	location?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
	start: string;
	summary: string;
	wholeDay?: boolean | undefined;
}

export const createEventDefinition = {
	description:
		"Creates an event in the calendar specified by its URL. For all-day events, set `wholeDay` to true. For a single-day all-day event, use `start` and `end` datetimes on the same calendar date; they do not need to be identical timestamps.",
	inputSchema: {
		calendarUrl: z.string(),
		description: z.string().optional(),
		end: z
			.string()
			.datetime({ offset: true })
			.describe("End datetime (ISO 8601)"),
		location: z.string().optional(),
		recurrenceRule: recurrenceRuleSchema.optional(),
		start: z
			.string()
			.datetime({ offset: true })
			.describe("Start datetime (ISO 8601)"),
		summary: z.string(),
		wholeDay: z.boolean().optional().describe("Create as a whole-day event"),
	},
	name: "create-event",
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
				end: wholeDay ? toWholeDayDate(end) : new Date(end),
				start: wholeDay ? toWholeDayDate(start) : new Date(start),
				summary,
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule, wholeDay),
				}),
			});

			return {
				content: [{ text: event.uid, type: "text" }],
			};
		}
	);
}
