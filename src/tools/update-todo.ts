import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { hrefFor } from "./caldav-href.js";
import { type TodoStatus, todoStatusSchema } from "./todo-status.js";

type UpdateTodoInput = {
	uid: string;
	calendarUrl: string;
	summary?: string | undefined;
	due?: string | undefined;
	start?: string | undefined;
	description?: string | undefined;
	location?: string | undefined;
	status?: TodoStatus | undefined;
};

export const updateTodoDefinition = {
	name: "update-todo",
	description:
		"Updates an existing task (VTODO) in the calendar specified by its URL. Only provided fields are changed. To mark a task done, prefer the `complete-todo` tool.",
	inputSchema: {
		uid: z
			.string()
			.describe("Unique identifier of the todo to update (from list-todos)"),
		calendarUrl: z.string(),
		summary: z.string().optional(),
		due: z.string().datetime({ offset: true }).optional(),
		start: z.string().datetime({ offset: true }).optional(),
		description: z.string().optional(),
		location: z.string().optional(),
		status: todoStatusSchema.optional(),
	},
	returns: "The unique ID of the updated todo",
} as const;

export function registerUpdateTodo(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		updateTodoDefinition.name,
		{
			description: updateTodoDefinition.description,
			inputSchema: updateTodoDefinition.inputSchema,
		},
		async (args: UpdateTodoInput) => {
			const {
				uid,
				calendarUrl,
				summary,
				due,
				start,
				description,
				location,
				status,
			} = args;

			const href = hrefFor(calendarUrl, uid);
			const [existing] = await client.getTodosByHref(calendarUrl, [href]);
			if (!existing) {
				throw new Error(`Todo not found: ${uid}`);
			}

			// RFC 5545: a COMPLETED VTODO carries a COMPLETED timestamp. Keep status
			// and that timestamp consistent so updating status here can't leave the
			// task in the RFC-incomplete state complete-todo guards against. An
			// existing completion time is preserved (completion happened once);
			// transitioning away drops it. `completed` is pulled out of `existing`
			// so the cleared case omits the property entirely rather than setting it
			// undefined (which exactOptionalPropertyTypes forbids).
			const { completed: priorCompleted, ...base } = existing;
			const completed =
				status === undefined
					? priorCompleted
					: status === "COMPLETED"
						? (priorCompleted ?? new Date())
						: undefined;

			const updated = await client.updateTodo(calendarUrl, {
				...base,
				...(summary !== undefined && { summary }),
				...(due !== undefined && { due: new Date(due) }),
				...(start !== undefined && { start: new Date(start) }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(status !== undefined && { status }),
				...(completed !== undefined && { completed }),
			});

			return {
				content: [{ type: "text", text: updated.uid }],
			};
		},
	);
}
