import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, RecurrenceRule } from "ts-caldav";
import { z } from "zod";

type RecurrenceRuleInput = {
	freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | undefined;
	interval?: number | undefined;
	count?: number | undefined;
	until?: string | undefined;
	byday?: string[] | undefined;
	bymonthday?: number[] | undefined;
	bymonth?: number[] | undefined;
};

type CreateEventInput = {
	summary: string;
	start: string;
	end: string;
	calendarUrl: string;
	wholeDay?: boolean | undefined;
	description?: string | undefined;
	location?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
};

function toRecurrenceRule(r: RecurrenceRuleInput): RecurrenceRule {
	const out: RecurrenceRule = {};
	if (r.freq !== undefined) out.freq = r.freq;
	if (r.interval !== undefined) out.interval = r.interval;
	if (r.count !== undefined) out.count = r.count;
	if (r.until !== undefined) out.until = new Date(r.until);
	if (r.byday !== undefined) out.byday = r.byday;
	if (r.bymonthday !== undefined) out.bymonthday = r.bymonthday;
	if (r.bymonth !== undefined) out.bymonth = r.bymonth;
	return out;
}

const recurrenceRuleSchema = z.object({
	freq: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
	interval: z.number().optional(),
	count: z.number().optional(),
	until: z.string().datetime({ offset: true }).optional(), // ISO 8601 string
	byday: z.array(z.string()).optional(), // e.g. ["MO", "TU"]
	bymonthday: z.array(z.number()).optional(),
	bymonth: z.array(z.number()).optional(),
});

export const createEventDefinition = {
	name: "create-event",
	description:
		"Creates an event in the calendar specified by its URL. For a one-day full-day event, set `wholeDay` to true and set `start` and `end` to the same calendar day.",
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
		calendarUrl: z.string(),
		wholeDay: z.boolean().optional().describe("Create as a whole-day event"),
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
				calendarUrl,
				summary,
				start,
				end,
				wholeDay,
				description,
				location,
				recurrenceRule,
			} = args;
			const event = await client.createEvent(calendarUrl, {
				summary: summary,
				start: new Date(start),
				end: new Date(end),
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule),
				}),
			});

			return {
				content: [{ type: "text", text: event.uid }],
			};
		},
	);
}
