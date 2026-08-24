import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { z } from "zod";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
};

function localDate(instant: Date): string {
	const month = `${instant.getMonth() + 1}`.padStart(2, "0");
	const day = `${instant.getDate()}`.padStart(2, "0");
	return `${instant.getFullYear()}-${month}-${day}`;
}

/**
 * The calendar dates a whole-day event covers, last day included.
 *
 * A `VALUE=DATE` carries no time and no zone, but ical.js hands it back as a
 * `Date` at local midnight. Reporting that instant puts the event on the day
 * before for any zone east of UTC: `20260825` reads as `2026-08-24T22:00:00Z`
 * in Berlin, so a vacation stored correctly looks shifted. Reading the local
 * calendar fields undoes the conversion. DTEND is exclusive, so the day before
 * it is the last one the event covers. A missing DTEND leaves start and end on
 * the same date.
 */
function wholeDaySpan(event: Event) {
	const lastDay = new Date(event.end);
	lastDay.setDate(lastDay.getDate() - 1);
	const start = localDate(event.start);
	const end = localDate(lastDay);
	return { start, end: end < start ? start : end, wholeDay: true };
}

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
		"A list of events that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, and optionally `description` and `location`. A whole-day event carries `wholeDay: true`, and its `start` and `end` are plain calendar dates (`YYYY-MM-DD`); `end` names the last day the event covers, not the exclusive DTEND, so it is the day create-event and update-event take as their own `end`. Those two require a full ISO 8601 datetime, so add a time and an offset before passing such a date back. Every other event gives `start` and `end` as ISO 8601 instants.",
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
			const options = {
				start: new Date(start),
				end: new Date(end),
			};
			const allEvents = await client.getEvents(calendarUrl, options);
			const data = allEvents.map((e) => ({
				uid: e.uid,
				summary: e.summary,
				...(e.wholeDay === true
					? wholeDaySpan(e)
					: { start: e.start, end: e.end }),
				...(e.description && { description: e.description }),
				...(e.location && { location: e.location }),
			}));
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
