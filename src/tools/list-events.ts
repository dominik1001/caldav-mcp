import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import { wholeDaySpan } from "./whole-day-date.js";

interface ListEventsInput {
	calendarUrl: string;
	end: string;
	start: string;
}

export const listEventsDefinition = {
	description:
		"List all events between start and end date in the calendar specified by its URL. A whole-day event has `wholeDay: true` and plain calendar dates (`YYYY-MM-DD`) as `start` and `end`; `end` is the last day the event covers (inclusive, not the exclusive iCalendar DTEND). These dates can be passed to create-event and update-event as they are, together with `wholeDay: true`. Every other event has ISO 8601 instants.",
	inputSchema: {
		calendarUrl: z.string(),
		end: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("End date (ISO 8601)"),
		start: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("Start date (ISO 8601)"),
	},
	name: "list-events",
	returns:
		"A list of events that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, and optionally `description` and `location`. A whole-day event also carries `wholeDay: true`, and its `start` and `end` are plain calendar dates (`YYYY-MM-DD`) with `end` being the last day covered.",
} as const;

export function registerListEvents(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		listEventsDefinition.name,
		{
			description: listEventsDefinition.description,
			inputSchema: listEventsDefinition.inputSchema,
		},
		async (args: ListEventsInput) => {
			const { start, end } = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			const options = {
				end: new Date(end),
				start: new Date(start),
			};
			const allEvents = await client.getEvents(calendarUrl, options);
			const data = allEvents.map((e) => ({
				...(e.wholeDay === true
					? wholeDaySpan(e)
					: { end: e.end, start: e.start }),
				summary: e.summary,
				uid: e.uid,
				...(e.description && { description: e.description }),
				...(e.location && { location: e.location }),
			}));
			return {
				content: [{ text: JSON.stringify(data), type: "text" }],
			};
		}
	);
}
