import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { hrefFor } from "./caldav-href.js";

type CompleteTodoInput = {
	uid: string;
	calendarUrl: string;
};

export const completeTodoDefinition = {
	name: "complete-todo",
	description:
		"Marks a task (VTODO) as done. Sets its status to COMPLETED and records the completion time.",
	inputSchema: {
		uid: z
			.string()
			.describe("Unique identifier of the todo to complete (from list-todos)"),
		calendarUrl: z.string(),
	},
	returns: "The unique ID of the completed todo",
} as const;

export function registerCompleteTodo(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		completeTodoDefinition.name,
		{
			description: completeTodoDefinition.description,
			inputSchema: completeTodoDefinition.inputSchema,
		},
		async (args: CompleteTodoInput) => {
			const { uid, calendarUrl } = args;
			const href = hrefFor(calendarUrl, uid);
			const [existing] = await client.getTodosByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Todo not found: ${uid}`);
			}

			// RFC 5545: a COMPLETED VTODO should carry a COMPLETED timestamp.
			const updated = await client.updateTodo(calendarUrl, {
				...existing,
				status: "COMPLETED",
				completed: new Date(),
			});

			return {
				content: [{ type: "text", text: updated.uid }],
			};
		},
	);
}
