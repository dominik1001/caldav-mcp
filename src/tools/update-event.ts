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

type UpdateEventInput = {
	uid: string;
	calendarUrl: string;
	summary?: string | undefined;
	start?: string | undefined;
	end?: string | undefined;
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
	until: z.string().datetime({ offset: true }).optional(),
	byday: z.array(z.string()).optional(),
	bymonthday: z.array(z.number()).optional(),
	bymonth: z.array(z.number()).optional(),
});

export const updateEventDefinition = {
	name: "update-event",
	description:
		"Updates an existing event in the calendar specified by its URL. Only provided fields are changed. For a one-day full-day event, set `wholeDay` to true and set `start` and `end` to the same calendar day.",
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
		wholeDay: z
			.boolean()
			.optional()
			.describe("Update whether this is a whole-day event"),
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
				wholeDay,
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
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule),
				}),
			});

			return {
				content: [{ type: "text", text: updated.uid }],
			};
		},
	);
}
