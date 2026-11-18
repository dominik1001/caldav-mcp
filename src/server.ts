import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";

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

/**
 * Builds a fresh MCP server with every tool registered. HTTP mode calls this
 * once per request: an McpServer can only be connected to one transport.
 */
export function createServer(client: CalDAVClient): McpServer {
	const server = new McpServer({
		name: "caldav-mcp",
		version: "0.1.0",
	});

	registerCreateEvent(client, server);
	registerListEvents(client, server);
	registerDeleteEvent(client, server);
	registerUpdateEvent(client, server);
	registerCreateTodo(client, server);
	registerListTodos(client, server);
	registerUpdateTodo(client, server);
	registerCompleteTodo(client, server);
	registerDeleteTodo(client, server);
	registerListCalendars(client, server);

	return server;
}
