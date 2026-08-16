import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { occurrencesWithin } from "./recurrence.js";

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
		"A list of occurrences that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, `recurring`, and optionally `description` and `location`. A recurring series contributes one entry per occurrence in the timeframe, so several entries can share a `uid`.",
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
			});
			const data = allEvents.flatMap((e) => {
				const duration = e.end.getTime() - e.start.getTime();
				return occurrencesWithin(e, windowStart, windowEnd).map(
					(occurrence) => ({
						uid: e.uid,
						summary: e.summary,
						start: occurrence,
						end: new Date(occurrence.getTime() + duration),
						recurring: Boolean(e.recurrenceRule),
						...(e.description && { description: e.description }),
						...(e.location && { location: e.location }),
					}),
				);
			});
			data.sort((a, b) => a.start.getTime() - b.start.getTime());
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
