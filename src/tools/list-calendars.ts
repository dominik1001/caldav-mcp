import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";

export async function registerListCalendars(
	client: CalDAVClient,
	server: McpServer,
) {
	const calendars = await client.getCalendars();

	server.registerTool(
		"list-calendars",
		{
			description: "List all calendars returning both name and URL",
			inputSchema: {},
		},
		async () => {
			return { content: [{ type: "text", text: JSON.stringify(calendars) }] };
		},
	);
}
