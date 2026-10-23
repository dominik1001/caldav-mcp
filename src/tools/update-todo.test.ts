import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Todo } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerUpdateTodo } from "./update-todo.js";

type ToolHandler = (params: {
	uid: string;
	calendarUrl: string;
	summary?: string;
	due?: string;
	start?: string;
	description?: string;
	location?: string;
	status?: "NEEDS-ACTION" | "COMPLETED" | "IN-PROCESS" | "CANCELLED";
}) => Promise<{ content: { type: string; text: string }[] }>;

const existingTodo: Todo = {
	etag: '"abc123"',
	href: "/f/tasks/todo-123.ics",
	status: "NEEDS-ACTION",
	summary: "Original",
	uid: "todo-123",
};

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "update-todo") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		}
	) as typeof server.registerTool;
	return { getHandler: () => toolHandler, server };
}

describe("registerUpdateTodo", () => {
	test("updates only the provided fields and returns the uid", async () => {
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existingTodo]),
			updateTodo: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: existingTodo.href,
				newCtag: "",
				uid: "todo-123",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const dueIso = "2026-08-01T12:00:00.000Z";
		const result = await handler({
			calendarUrl: "/f/tasks/",
			due: dueIso,
			summary: "Updated",
			uid: "todo-123",
		});

		expect(result.content[0].text).toBe("todo-123");
		expect(mockClient.getTodosByHref).toHaveBeenCalledWith("/f/tasks/", [
			"/f/tasks/todo-123.ics",
		]);
		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed).toMatchObject({
			etag: '"abc123"',
			status: "NEEDS-ACTION",
			summary: "Updated",
			uid: "todo-123",
		});
		expect(passed.due).toBeInstanceOf(Date);
		expect(passed.due.toISOString()).toBe(dueIso);
	});

	test("throws when the todo is not found", async () => {
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([]),
			updateTodo: vi.fn(),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await expect(
			handler({ calendarUrl: "/f/tasks/", uid: "missing" })
		).rejects.toThrow("Todo not found: missing");
		expect(mockClient.updateTodo).not.toHaveBeenCalled();
	});

	test("preserves the existing todo intact when no mutating fields are given", async () => {
		const existing: Todo = {
			...existingTodo,
			description: "keep me",
			due: new Date("2026-09-01T00:00:00.000Z"),
		};
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existing]),
			updateTodo: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: existing.href,
				newCtag: "",
				uid: "todo-123",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const result = await handler({ calendarUrl: "/f/tasks/", uid: "todo-123" });

		expect(result.content[0].text).toBe("todo-123");
		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed).toMatchObject({
			description: "keep me",
			etag: '"abc123"',
			status: "NEEDS-ACTION",
			summary: "Original",
			uid: "todo-123",
		});
		expect(passed.due).toBe(existing.due);
	});

	test("stamps a completed timestamp when status transitions to COMPLETED", async () => {
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existingTodo]),
			updateTodo: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: existingTodo.href,
				newCtag: "",
				uid: "todo-123",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/tasks/",
			status: "COMPLETED",
			uid: "todo-123",
		});

		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed.status).toBe("COMPLETED");
		expect(passed.completed).toBeInstanceOf(Date);
	});

	test("preserves the original completion time when an already-done task is re-completed", async () => {
		const completedAt = new Date("2026-01-02T03:04:05.000Z");
		const existing: Todo = {
			...existingTodo,
			completed: completedAt,
			status: "COMPLETED",
		};
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existing]),
			updateTodo: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: existing.href,
				newCtag: "",
				uid: "todo-123",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/tasks/",
			status: "COMPLETED",
			summary: "Edited after completion",
			uid: "todo-123",
		});

		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed.completed).toBe(completedAt);
	});

	test("clears the completed timestamp when status transitions away from COMPLETED", async () => {
		const existing: Todo = {
			...existingTodo,
			completed: new Date("2026-01-02T03:04:05.000Z"),
			status: "COMPLETED",
		};
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existing]),
			updateTodo: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: existing.href,
				newCtag: "",
				uid: "todo-123",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/tasks/",
			status: "NEEDS-ACTION",
			uid: "todo-123",
		});

		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed.status).toBe("NEEDS-ACTION");
		expect(passed.completed).toBeUndefined();
	});
});
