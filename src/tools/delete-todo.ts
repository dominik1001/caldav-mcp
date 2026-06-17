import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { hrefFor } from "./caldav-href.js";

type DeleteTodoInput = {
	uid: string;
	calendarUrl: string;
};

export const deleteTodoDefinition = {
	name: "delete-todo",
	description: "Deletes a task (VTODO) in the calendar specified by its URL",
	inputSchema: {
		uid: z
			.string()
			.describe("Unique identifier of the todo to delete (from list-todos)"),
		calendarUrl: z.string(),
	},
	returns: "Confirmation message when the todo is successfully deleted",
} as const;

export function registerDeleteTodo(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		deleteTodoDefinition.name,
		{
			description: deleteTodoDefinition.description,
			inputSchema: deleteTodoDefinition.inputSchema,
		},
		async (args: DeleteTodoInput) => {
			const { uid, calendarUrl } = args;
			const etag = await client.getETag(hrefFor(calendarUrl, uid));
			await client.deleteTodo(calendarUrl, uid, etag);

			return {
				content: [{ type: "text", text: "Todo deleted" }],
			};
		},
	);
}
