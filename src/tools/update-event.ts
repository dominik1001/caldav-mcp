import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, RecurrenceRule } from "ts-caldav";
import { z } from "zod";

type UpdateEventInput = {
	uid: string;
	calendarUrl: string;
	summary?: string;
	start?: string;
	end?: string;
	description?: string;
	location?: string;
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
	until: z.string().datetime({ offset: true }).optional(),
	byday: z.array(z.string()).optional(),
	bymonthday: z.array(z.number()).optional(),
	bymonth: z.array(z.number()).optional(),
});

export const updateEventDefinition = {
	name: "update-event",
	description:
		"Updates an existing event in the calendar specified by its URL. Only provided fields are changed.",
	inputSchema: {
		uid: z
			.string()
			.describe(
				"Unique identifier of the event to update (obtained from list-events)",
			),
		calendarUrl: z.string(),
		summary: z.string().optional(),
		start: z.string().datetime({ offset: true }).optional(),
		end: z.string().datetime({ offset: true }).optional(),
		description: z.string().optional(),
		location: z.string().optional(),
		recurrenceRule: recurrenceRuleSchema.optional(),
	},
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
				calendarUrl,
				summary,
				start,
				end,
				description,
				location,
				recurrenceRule,
			} = args;

			const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
			const href = `${base}${uid}.ics`;

			const [existing] = await client.getEventsByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Event not found: ${uid}`);
			}

			const updated = await client.updateEvent(calendarUrl, {
				...existing,
				...(summary !== undefined && { summary }),
				...(start !== undefined && { start: new Date(start) }),
				...(end !== undefined && { end: new Date(end) }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: recurrenceRule as RecurrenceRule,
				}),
			});

			return {
				content: [{ type: "text", text: updated.uid }],
			};
		},
	);
}
