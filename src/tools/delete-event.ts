import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";

type DeleteEventInput = {
	uid: string;
	calendarUrl: string;
};

export function registerDeleteEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		"delete-event",
		{
			description: "Deletes an event in the calendar specified by its URL",
			inputSchema: { uid: z.string(), calendarUrl: z.string() },
		},
		async (args: DeleteEventInput) => {
			const { uid, calendarUrl } = args;
			await client.deleteEvent(calendarUrl, uid);

			return {
				content: [{ type: "text", text: "Event deleted" }],
			};
		},
	);
}
