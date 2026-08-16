import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { expandEvents } from "./recurrence.js";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
};

export const listEventsDefinition = {
	name: "list-events",
	description:
		"List all events between start and end date in the calendar specified by its URL",
	inputSchema: {
		start: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("Start date (ISO 8601)"),
		end: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("End date (ISO 8601)"),
		calendarUrl: z.string(),
	},
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
			const { calendarUrl, start, end } = args;
			const windowStart = new Date(start);
			const windowEnd = new Date(end);
			const allEvents = await client.getEvents(calendarUrl, {
				start: windowStart,
				end: windowEnd,
				// Servers that honour this return the occurrences already expanded,
				// with EXDATE and replacements applied; expandEvents then only has to
				// pass them through. The ones that ignore it are why it exists.
				expand: true,
			});
			const data = expandEvents(allEvents, windowStart, windowEnd).map(
				({ event, start, key, fromSeries }) => ({
					uid: event.uid,
					summary: event.summary,
					start,
					end: new Date(
						start.getTime() + (event.end.getTime() - event.start.getTime()),
					),
					recurring: fromSeries,
					// Identifies this occurrence within the series. `uid` addresses the
					// whole series, so update-event and delete-event acting on it hit
					// every instance, not the one shown here.
					occurrence: key,
					...(event.description && { description: event.description }),
					...(event.location && { location: event.location }),
				}),
			);
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
