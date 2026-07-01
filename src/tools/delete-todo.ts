import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CalDAVClient, CalDAVError } from "ts-caldav";
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
			// Map a missing object onto the same friendly message complete-todo and
			// update-todo raise, so all three todo tools report a missing task the
			// same way. (delete-event still surfaces the raw transport error; the
			// event family is left as-is.) Non-404 failures propagate untouched.
			let etag: string;
			try {
				etag = await client.getETag(hrefFor(calendarUrl, uid));
			} catch (error) {
				if (error instanceof CalDAVError && error.status === 404) {
					throw new Error(`Todo not found: ${uid}`);
				}
				throw error;
			}
			await client.deleteTodo(calendarUrl, uid, etag);

			return {
				content: [{ type: "text", text: "Todo deleted" }],
			};
		},
	);
}
