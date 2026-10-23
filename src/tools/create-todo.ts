import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import { type TodoStatus, todoStatusSchema } from "./todo-status.js";

interface CreateTodoInput {
	calendarUrl: string;
	description?: string | undefined;
	due?: string | undefined;
	location?: string | undefined;
	start?: string | undefined;
	status?: TodoStatus | undefined;
	summary: string;
}

export const createTodoDefinition = {
	description:
		"Creates a task (VTODO) in the calendar specified by its URL. Only `summary` is required; a task may have no dates. Use `due` for a deadline and `start` for when work should begin.",
	inputSchema: {
		calendarUrl: z.string(),
		description: z.string().optional(),
		due: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe("Due datetime (ISO 8601)"),
		location: z.string().optional(),
		start: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe("Start datetime (ISO 8601)"),
		status: todoStatusSchema
			.optional()
			.describe("Defaults to NEEDS-ACTION when omitted"),
		summary: z.string(),
	},
	name: "create-todo",
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
			const { summary, due, start, description, location, status } = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			const todo = await client.createTodo(calendarUrl, {
				summary,
				...(due !== undefined && { due: new Date(due) }),
				...(start !== undefined && { start: new Date(start) }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(status !== undefined && { status }),
			});

			return {
				content: [{ text: todo.uid, type: "text" }],
			};
		}
	);
}
