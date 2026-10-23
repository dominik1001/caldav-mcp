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
			if (name === "list-todos") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		}
	) as typeof server.registerTool;
	return { getHandler: () => toolHandler, server };
}

function setup(todos: Todo[]) {
	const mockClient = { getTodos: vi.fn().mockResolvedValue(todos) };
	const { server, getHandler } = makeServer();
	registerListTodos(mockClient as unknown as CalDAVClient, server);
	const handler = getHandler();
	if (!handler) {
		throw new Error("handler not registered");
	}
	return { handler, mockClient };
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
		const a = todo({ sortOrder: 2, summary: "A", uid: "a" });
		const b = todo({ sortOrder: 1, summary: "B", uid: "b" });
		const c = todo({ due: new Date("2026-01-01"), summary: "C", uid: "c" });
		const d = todo({ due: new Date("2026-02-01"), summary: "D", uid: "d" });
		const e = todo({ summary: "E", uid: "e" });

		const sorted = [e, d, c, b, a].sort(compareTodos).map((t) => t.uid);
		// b,a have sortOrder so come first (1 then 2); then due-sorted c,d; then undated e
		expect(sorted).toEqual(["b", "a", "c", "d", "e"]);
	});

	test("sortOrder wins over due when both are present", () => {
		// a has the earlier sortOrder but the later due; sortOrder must win,
		// proving precedence and not a due-first regression.
		const a = todo({
			due: new Date("2026-12-01"),
			sortOrder: 1,
			summary: "A",
			uid: "a",
		});
		const b = todo({
			due: new Date("2026-01-01"),
			sortOrder: 2,
			summary: "B",
			uid: "b",
		});
		const sorted = [b, a].sort(compareTodos).map((t) => t.uid);
		expect(sorted).toEqual(["a", "b"]);
	});

	test("undated tasks sort after dated ones; summary breaks final tie", () => {
		const x = todo({ summary: "Zebra", uid: "x" });
		const y = todo({ summary: "Apple", uid: "y" });
		const sorted = [x, y].sort(compareTodos).map((t) => t.uid);
		expect(sorted).toEqual(["y", "x"]);
	});
});

describe("registerListTodos", () => {
	const mixed = [
		todo({ status: "NEEDS-ACTION", summary: "Open", uid: "open1" }),
		todo({ status: "IN-PROCESS", summary: "Working", uid: "prog" }),
		todo({ status: "COMPLETED", summary: "Done", uid: "done" }),
		todo({ status: "CANCELLED", summary: "Cancelled", uid: "cancel" }),
		todo({ summary: "No status", uid: "nostatus" }),
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
			await handler({ calendarUrl: "/f/tasks/", status: "COMPLETED" })
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["done"]);
	});

	test("an exact status filter matches only that status", async () => {
		const { handler } = setup(mixed);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", status: "CANCELLED" })
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["cancel"]);
	});

	test("status=ALL returns everything", async () => {
		const { handler } = setup(mixed);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", status: "ALL" })
		);
		expect(out.total).toBe(5);
	});

	test("due window excludes undated tasks and out-of-range dates", async () => {
		const items = [
			todo({ due: new Date("2026-01-01"), summary: "Early", uid: "early" }),
			todo({
				due: new Date("2026-06-15"),
				summary: "In range",
				uid: "inrange",
			}),
			todo({ summary: "Undated", uid: "undated" }),
		];
		const { handler } = setup(items);
		const out = parse(
			await handler({
				calendarUrl: "/f/tasks/",
				due_after: "2026-06-01T00:00:00.000Z",
				due_before: "2026-06-30T00:00:00.000Z",
				status: "ALL",
			})
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["inrange"]);
	});

	test("paginates with limit/offset and reports pre-pagination total", async () => {
		const items = Array.from({ length: 5 }, (_, i) =>
			todo({
				sortOrder: i,
				status: "NEEDS-ACTION",
				summary: `T${i}`,
				uid: `t${i}`,
			})
		);
		const { handler } = setup(items);
		const out = parse(
			await handler({ calendarUrl: "/f/tasks/", limit: 2, offset: 2 })
		);
		expect(out.todos.map((t) => t.uid)).toEqual(["t2", "t3"]);
		expect(out).toMatchObject({ limit: 2, offset: 2, total: 5 });
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
