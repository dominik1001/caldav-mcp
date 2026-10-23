import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { toAbsoluteUrl } from "./caldav-href.js";

export const listCalendarsDefinition = {
	description:
		"List all calendars returning both name and absolute URL. Pass a calendar's `url` unchanged as `calendarUrl` to the other tools.",
	inputSchema: {},
	name: "list-calendars",
	returns: "List of all available calendars",
} as const;

export async function registerListCalendars(
	client: CalDAVClient,
	server: McpServer
) {
	// ts-caldav returns server-relative hrefs; resolve them so agents don't
	// have to guess how to prefix the base URL.
	const calendars = (await client.getCalendars()).map((calendar) => ({
		...calendar,
		url: toAbsoluteUrl(calendar.url, client.baseUrl),
	}));

	server.registerTool(
		listCalendarsDefinition.name,
		{
			description: listCalendarsDefinition.description,
			inputSchema: listCalendarsDefinition.inputSchema,
		},
		async () => ({
			content: [{ text: JSON.stringify(calendars), type: "text" }],
		})
	);
}
