import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
};

export function registerListEvents(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		"list-events",
		{
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
		},
		async (args: ListEventsInput) => {
			const { calendarUrl, start, end } = args;
			const options = {
				start: new Date(start),
				end: new Date(end),
			};
			const allEvents = await client.getEvents(calendarUrl, options);
			const data = allEvents.map((e) => ({
				uid: e.uid,
				summary: e.summary,
				start: e.start,
				end: e.end,
			}));
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
