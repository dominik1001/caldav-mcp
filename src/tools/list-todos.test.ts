import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Todo } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import {
	compareTodos,
	listTodosDefinition,
	registerListTodos,
} from "./list-todos.js";

function todo(partial: Partial<Todo> & { uid: string; summary: string }): Todo {
	return {
		href: `/f/tasks/${partial.uid}.ics`,
		...partial,
	} as Todo;
}

type ToolHandler = (params: {
	calendarUrl: string;
	status?: string;
	due_before?: string;
	due_after?: string;
	limit?: number;
	offset?: number;
}) => Promise<{ content: { type: string; text: string }[] }>;

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "list-todos") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

function setup(todos: Todo[]) {
	const mockClient = { getTodos: vi.fn().mockResolvedValue(todos) };
	const { server, getHandler } = makeServer();
	registerListTodos(mockClient as unknown as CalDAVClient, server);
	const handler = getHandler();
	if (!handler) throw new Error("handler not registered");
	return { mockClient, handler };
}

function parse(result: { content: { text: string }[] }) {
	return JSON.parse(result.content[0].text) as {
		todos: Array<{ uid: string; status: string; due?: string }>;
		total: number;
		limit: number;
		offset: number;
	};
}

describe("compareTodos", () => {
	test("orders by sortOrder asc, then due asc, then summary", () => {
		const a = todo({ uid: "a", summary: "A", sortOrder: 2 });
		const b = todo({ uid: "b", summary: "B", sortOrder: 1 });
		const c = todo({ uid: "c", summary: "C", due: new Date("2026-01-01") });
		const d = todo({ uid: "d", summary: "D", due: new Date("2026-02-01") });
		const e = todo({ uid: "e", summary: "E" });

		const sorted = [e, d, c, b, a].sort(compareTodos).map((t) => t.uid);
		// b,a have sortOrder so come first (1 then 2); then due-sorted c,d; then undated e
		expect(sorted).toEqual(["b", "a", "c", "d", "e"]);
	});

	test("sortOrder wins over due when both are present", () => {
		// a has the earlier sortOrder but the later due; sortOrder must win,
		// proving precedence and not a due-first regression.
		const a = todo({
			uid: "a",
			summary: "A",
			sortOrder: 1,
			due: new Date("2026-12-01"),
		});
		const b = todo({
			uid: "b",
			summary: "B",
			sortOrder: 2,
			due: new Date("2026-01-01"),
		});
		const sorted = [b, a].sort(compareTodos).map((t) => t.uid);
		expect(sorted).toEqual(["a", "b"]);
	});

	test("undated tasks sort after dated ones; summary breaks final tie", () => {
		const x = todo({ uid: "x", summary: "Zebra" });
		const y = todo({ uid: "y", summary: "Apple" });
		const sorted = [x, y].sort(compareTodos).map((t) => t.uid);
		expect(sorted).toEqual(["y", "x"]);
	});
});

describe("registerListTodos", () => {
	const mixed = [
		todo({ uid: "open1", summary: "Open", status: "NEEDS-ACTION" }),
		todo({ uid: "prog", summary: "Working", status: "IN-PROCESS" }),
		todo({ uid: "done", summary: "Done", status: "COMPLETED" }),
		todo({ uid: "cancel", summary: "Cancelled", status: "CANCELLED" }),
		todo({ uid: "nostatus", summary: "No status" }),
	];

	test("defaults to open: includes NEEDS-ACTION, IN-PROCESS, and missing status", async () => {
		const { mockClient, handler } = setup(mixed);
		const out = parse(await handler({ calendarUrl: "/f/tasks/" }));
		expect(mockClient.getTodos).toHaveBeenCalledWith("/f/tasks/", {
			all: true,
		});
		expect(out.todos.map((t) => t.uid).sort()).toEqual([
			"nostatus",
			"open1",
			"prog",
		]);
	});

	test("status=COMPLETED returns only completed", async () => {
		const { handler } = setup(mixed);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", status: "COMPLETED" }),
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["done"]);
	});

	test("an exact status filter matches only that status", async () => {
		const { handler } = setup(mixed);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", status: "CANCELLED" }),
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["cancel"]);
	});

	test("status=ALL returns everything", async () => {
		const { handler } = setup(mixed);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", status: "ALL" }),
		);
		expect(out.total).toBe(5);
	});

	test("due window excludes undated tasks and out-of-range dates", async () => {
		const items = [
			todo({ uid: "early", summary: "Early", due: new Date("2026-01-01") }),
			todo({
				uid: "inrange",
				summary: "In range",
				due: new Date("2026-06-15"),
			}),
			todo({ uid: "undated", summary: "Undated" }),
		];
		const { handler } = setup(items);
		const out = parse(
			await handler({
				calendarUrl: "/f/tasks/",
				status: "ALL",
				due_after: "2026-06-01T00:00:00.000Z",
				due_before: "2026-06-30T00:00:00.000Z",
			}),
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["inrange"]);
	});

	test("paginates with limit/offset and reports pre-pagination total", async () => {
		const items = Array.from({ length: 5 }, (_, i) =>
			todo({
				uid: `t${i}`,
				summary: `T${i}`,
				sortOrder: i,
				status: "NEEDS-ACTION",
			}),
		);
		const { handler } = setup(items);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", limit: 2, offset: 2 }),
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["t2", "t3"]);
		expect(out).toMatchObject({ total: 5, limit: 2, offset: 2 });
	});
});

describe("listTodosDefinition.inputSchema", () => {
	const { status, limit } = listTodosDefinition.inputSchema;

	test("limit is bounded to an upper cap", () => {
		expect(limit.safeParse(500).success).toBe(true);
		expect(limit.safeParse(501).success).toBe(false);
	});

	test("status accepts the keywords and raw statuses but not lowercase aliases", () => {
		for (const ok of ["OPEN", "ALL", "COMPLETED", "NEEDS-ACTION"]) {
			expect(status.safeParse(ok).success).toBe(true);
		}
		// `completed`/`open` were redundant lowercase aliases; only the raw status
		// and the OPEN/ALL keywords remain.
		for (const bad of ["completed", "open", "all"]) {
			expect(status.safeParse(bad).success).toBe(false);
		}
	});
});
