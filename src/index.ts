#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { registerCreateEvent } from "./tools/create-event.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";

const server = new McpServer({
	name: "caldav-mcp",
	version: "0.1.0",
});

async function main() {
	const client = await CalDAVClient.create({
		baseUrl: process.env.CALDAV_BASE_URL || "",
		auth: {
			type: "basic",
			username: process.env.CALDAV_USERNAME || "",
			password: process.env.CALDAV_PASSWORD || "",
		},
	});

	registerCreateEvent(client, server);
	registerListEvents(client, server);
	registerDeleteEvent(client, server);
	await registerListCalendars(client, server);

	// Start receiving messages on stdin and sending messages on stdout
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
