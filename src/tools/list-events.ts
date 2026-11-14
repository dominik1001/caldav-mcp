import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import { expandEvents } from "./recurrence.js";

interface ListEventsInput {
	calendarUrl: string;
	end: string;
	start: string;
}

export const listEventsDefinition = {
	description:
		"List all events between start and end date in the calendar specified by its URL",
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
		"A list of occurrences that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, `recurring`, `occurrence`, and optionally `description` and `location`. A recurring series contributes one entry per occurrence, so several entries share a `uid`. Careful when acting on one of them: `uid` addresses the whole series, and update-event and delete-event take nothing finer, so they change or remove every instance. `occurrence` names the single slot for display and cannot be passed back to target it.",
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
			const windowStart = new Date(start);
			const windowEnd = new Date(end);
			const allEvents = await client.getEvents(calendarUrl, {
				end: windowEnd,
				// Servers that honour this return the occurrences already expanded,
				// with EXDATE and replacements applied; expandEvents then only has to
				// pass them through. The ones that ignore it are why it exists.
				expand: true,
				start: windowStart,
			});
			const data = expandEvents(allEvents, windowStart, windowEnd).map(
				({ event, start: occurrenceStart, key, fromSeries }) => ({
					end: new Date(
						occurrenceStart.getTime() +
							(event.end.getTime() - event.start.getTime())
					),
					// Identifies this occurrence within the series. `uid` addresses the
					// whole series, so update-event and delete-event acting on it hit
					// every instance, not the one shown here.
					occurrence: key,
					recurring: fromSeries,
					start: occurrenceStart,
					summary: event.summary,
					uid: event.uid,
					...(event.description && { description: event.description }),
					...(event.location && { location: event.location }),
				})
			);
			return {
				content: [{ text: JSON.stringify(data), type: "text" }],
			};
		}
	);
}
