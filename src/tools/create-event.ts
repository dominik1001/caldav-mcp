import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, RecurrenceRule } from "ts-caldav";
import { z } from "zod";

type CreateEventInput = {
	summary: string;
	start: string;
	end: string;
	calendarUrl: string;
	recurrenceRule?: {
		freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
		interval?: number;
		count?: number;
		until?: string;
		byday?: string[];
		bymonthday?: number[];
		bymonth?: number[];
	};
};

const recurrenceRuleSchema = z.object({
	freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
	interval: z.number().optional(),
	count: z.number().optional(),
	until: z.string().datetime().optional(), // ISO 8601 string
	byday: z.array(z.string()).optional(), // e.g. ["MO", "TU"]
	bymonthday: z.array(z.number()).optional(),
	bymonth: z.array(z.number()).optional(),
});

export function registerCreateEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		"create-event",
		{
			description: "Creates an event in the calendar specified by its URL",
			inputSchema: {
				summary: z.string(),
				start: z.string().datetime(),
				end: z.string().datetime(),
				calendarUrl: z.string(),
				recurrenceRule: recurrenceRuleSchema.optional(),
			},
		},
		async (args: CreateEventInput) => {
			const { calendarUrl, summary, start, end, recurrenceRule } = args;
			const event = await client.createEvent(calendarUrl, {
				summary: summary,
				start: new Date(start),
				end: new Date(end),
				recurrenceRule: recurrenceRule as RecurrenceRule,
			});

			return {
				content: [{ type: "text", text: event.uid }],
			};
		},
	);
}
