import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Todo } from "ts-caldav";
import { z } from "zod";
import { type TodoStatus, todoStatusSchema } from "./todo-status.js";

// `OPEN`/`ALL` are filter keywords expressing sets no single status can (a union
// and "no filter"); the four raw statuses allow an exact-status query. The raw
// values come from todoStatusSchema so adding a new status stays in sync with
// create/update instead of silently diverging. A `COMPLETED` query goes through
// the raw status — no separate `completed` keyword, which would just duplicate it.
const statusFilterSchema = z.enum(["OPEN", "ALL", ...todoStatusSchema.options]);

type StatusFilter = z.infer<typeof statusFilterSchema>;

type ListTodosInput = {
	calendarUrl: string;
	status?: StatusFilter | undefined;
	due_before?: string | undefined;
	due_after?: string | undefined;
	limit?: number | undefined;
	offset?: number | undefined;
};

const OPEN_STATUSES = ["NEEDS-ACTION", "IN-PROCESS"];

/** A VTODO without an explicit STATUS is treated as NEEDS-ACTION (RFC 5545). */
function statusOf(t: Todo): TodoStatus {
	return t.status ?? "NEEDS-ACTION";
}

/**
 * Sort order: `sortOrder` ascending (a user's explicit drag-reorder intent;
 * missing values sort last), then `due` ascending (undated tasks last), then
 * `summary`. When every task shares the same `sortOrder` (typically none set,
 * so all compare equal) the order falls through to the due date, so the same
 * rule serves both "I arranged these" and "show me by deadline" without a mode
 * flag.
 */
export function compareTodos(a: Todo, b: Todo): number {
	const soA = a.sortOrder ?? Number.POSITIVE_INFINITY;
	const soB = b.sortOrder ?? Number.POSITIVE_INFINITY;
	if (soA !== soB) return soA - soB;
	const dueA = a.due ? a.due.getTime() : Number.POSITIVE_INFINITY;
	const dueB = b.due ? b.due.getTime() : Number.POSITIVE_INFINITY;
	if (dueA !== dueB) return dueA - dueB;
	return a.summary.localeCompare(b.summary);
}

export const listTodosDefinition = {
	name: "list-todos",
	description:
		"List tasks (VTODOs) in the calendar specified by its URL. By default returns only open tasks (NEEDS-ACTION and IN-PROCESS), sorted by manual order then due date. Use `status` to include completed (`COMPLETED`) or all (`ALL`) tasks, and `limit`/`offset` to page through long lists.",
	inputSchema: {
		calendarUrl: z.string(),
		status: statusFilterSchema
			.optional()
			.describe(
				"Filter by status. `OPEN` (default) = NEEDS-ACTION + IN-PROCESS; `ALL` = everything; or an exact status (NEEDS-ACTION, COMPLETED, IN-PROCESS, CANCELLED).",
			),
		due_before: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe(
				"Only tasks with a due date at or before this (ISO 8601). Undated tasks are excluded when a due window is set.",
			),
		due_after: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe(
				"Only tasks with a due date at or after this (ISO 8601). Undated tasks are excluded when a due window is set.",
			),
		limit: z
			.number()
			.int()
			.positive()
			.max(500)
			.optional()
			.describe("Max tasks to return (default 50, max 500)"),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Tasks to skip (default 0)"),
	},
	returns:
		"An object `{ todos, total, limit, offset }` where `total` is the count before pagination. Each todo has `uid`, `summary`, `status`, and optionally `due`, `start`, `completed`, `description`, `location`.",
} as const;

export function registerListTodos(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		listTodosDefinition.name,
		{
			description: listTodosDefinition.description,
			inputSchema: listTodosDefinition.inputSchema,
		},
		async (args: ListTodosInput) => {
			const { calendarUrl } = args;
			const status = args.status ?? "OPEN";
			const limit = args.limit ?? 50;
			const offset = args.offset ?? 0;

			const hasWindow =
				args.due_after !== undefined || args.due_before !== undefined;
			const after =
				args.due_after !== undefined
					? new Date(args.due_after).getTime()
					: null;
			const before =
				args.due_before !== undefined
					? new Date(args.due_before).getTime()
					: null;

			const matchesStatus = (t: Todo): boolean => {
				const s = statusOf(t);
				if (status === "ALL") return true;
				if (status === "OPEN") return OPEN_STATUSES.includes(s);
				return s === status;
			};

			const matchesWindow = (t: Todo): boolean => {
				if (!hasWindow) return true;
				if (!t.due) return false;
				const d = t.due.getTime();
				if (after !== null && d < after) return false;
				if (before !== null && d > before) return false;
				return true;
			};

			const all = await client.getTodos(calendarUrl, { all: true });
			const filtered = all
				.filter((t) => matchesStatus(t) && matchesWindow(t))
				.sort(compareTodos);

			const todos = filtered.slice(offset, offset + limit).map((t) => ({
				uid: t.uid,
				summary: t.summary,
				status: statusOf(t),
				...(t.due && { due: t.due }),
				...(t.start && { start: t.start }),
				...(t.completed && { completed: t.completed }),
				...(t.description && { description: t.description }),
				...(t.location && { location: t.location }),
			}));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							todos,
							total: filtered.length,
							limit,
							offset,
						}),
					},
				],
			};
		},
	);
}
