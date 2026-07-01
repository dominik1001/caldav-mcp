#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { registerCompleteTodo } from "./tools/complete-todo.js";
import { registerCreateEvent } from "./tools/create-event.js";
import { registerCreateTodo } from "./tools/create-todo.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerDeleteTodo } from "./tools/delete-todo.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";
import { registerListTodos } from "./tools/list-todos.js";
import { registerUpdateEvent } from "./tools/update-event.js";
import { registerUpdateTodo } from "./tools/update-todo.js";

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

	// Test connection on startup
	try {
		await client.getCalendars();
	} catch (error) {
		console.error("❌ Failed to connect to CalDAV server:", error);
		process.exit(1);
	}

	registerCreateEvent(client, server);
	registerListEvents(client, server);
	registerDeleteEvent(client, server);
	registerUpdateEvent(client, server);
	registerCreateTodo(client, server);
	registerListTodos(client, server);
	registerUpdateTodo(client, server);
	registerCompleteTodo(client, server);
	registerDeleteTodo(client, server);
	await registerListCalendars(client, server);

	// Start receiving messages on stdin and sending messages on stdout
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
