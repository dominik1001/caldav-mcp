import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";

export const todoStatusSchema = z.enum([
	"NEEDS-ACTION",
	"COMPLETED",
	"IN-PROCESS",
	"CANCELLED",
]);

type TodoStatus = z.infer<typeof todoStatusSchema>;

type CreateTodoInput = {
	summary: string;
	calendarUrl: string;
	due?: string | undefined;
	start?: string | undefined;
	description?: string | undefined;
	location?: string | undefined;
	status?: TodoStatus | undefined;
};

export const createTodoDefinition = {
	name: "create-todo",
	description:
		"Creates a task (VTODO) in the calendar specified by its URL. Only `summary` is required; a task may have no dates. Use `due` for a deadline and `start` for when work should begin.",
	inputSchema: {
		summary: z.string(),
		calendarUrl: z.string(),
		due: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe("Due datetime (ISO 8601)"),
		start: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe("Start datetime (ISO 8601)"),
		description: z.string().optional(),
		location: z.string().optional(),
		status: todoStatusSchema
			.optional()
			.describe("Defaults to NEEDS-ACTION when omitted"),
	},
	returns: "The unique ID of the created todo",
} as const;

export function registerCreateTodo(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		createTodoDefinition.name,
		{
			description: createTodoDefinition.description,
			inputSchema: createTodoDefinition.inputSchema,
		},
		async (args: CreateTodoInput) => {
			const {
				calendarUrl,
				summary,
				due,
				start,
				description,
				location,
				status,
			} = args;
			const todo = await client.createTodo(calendarUrl, {
				summary,
				...(due !== undefined && { due: new Date(due) }),
				...(start !== undefined && { start: new Date(start) }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(status !== undefined && { status }),
			});

			return {
				content: [{ type: "text", text: todo.uid }],
			};
		},
	);
}
