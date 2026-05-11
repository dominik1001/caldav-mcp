import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";

type DeleteEventInput = {
	uid: string;
	calendarUrl: string;
};

export const deleteEventDefinition = {
	name: "delete-event",
	description: "Deletes an event in the calendar specified by its URL",
	inputSchema: {
		uid: z
			.string()
			.describe(
				"Unique identifier of the event to delete (obtained from list-events)",
			),
		calendarUrl: z.string(),
	},
	returns: "Confirmation message when the event is successfully deleted",
} as const;

export function registerDeleteEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		deleteEventDefinition.name,
		{
			description: deleteEventDefinition.description,
			inputSchema: deleteEventDefinition.inputSchema,
		},
		async (args: DeleteEventInput) => {
			const { uid, calendarUrl } = args;
			const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
			const href = `${base}${uid}.ics`;
			const etag = await client.getETag(href);
			await client.deleteEvent(calendarUrl, uid, etag);

			return {
				content: [{ type: "text", text: "Event deleted" }],
			};
		},
	);
}
