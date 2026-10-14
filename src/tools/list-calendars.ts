import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";

export const listCalendarsDefinition = {
	name: "list-calendars",
	description: "List all calendars returning both name and URL",
	inputSchema: {},
	returns: "List of all available calendars",
} as const;

export async function registerListCalendars(
	client: CalDAVClient,
	server: McpServer,
	prefetched?: Awaited<ReturnType<CalDAVClient["getCalendars"]>>,
) {
	const calendars = prefetched ?? (await client.getCalendars());

	server.registerTool(
		listCalendarsDefinition.name,
		{
			description: listCalendarsDefinition.description,
			inputSchema: listCalendarsDefinition.inputSchema,
		},
		async () => {
			return { content: [{ type: "text", text: JSON.stringify(calendars) }] };
		},
	);
}
