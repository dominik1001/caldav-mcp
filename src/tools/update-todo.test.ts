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
	uid: "todo-123",
	href: "/f/tasks/todo-123.ics",
	etag: '"abc123"',
	summary: "Original",
	status: "NEEDS-ACTION",
};

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "update-todo") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

describe("registerUpdateTodo", () => {
	test("updates only the provided fields and returns the uid", async () => {
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([existingTodo]),
			updateTodo: vi.fn().mockResolvedValue({
				uid: "todo-123",
				href: existingTodo.href,
				etag: '"new"',
				newCtag: "",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		const dueIso = "2026-08-01T12:00:00.000Z";
		const result = await handler({
			uid: "todo-123",
			calendarUrl: "/f/tasks/",
			summary: "Updated",
			due: dueIso,
		});

		expect(result.content[0].text).toBe("todo-123");
		expect(mockClient.getTodosByHref).toHaveBeenCalledWith("/f/tasks/", [
			"/f/tasks/todo-123.ics",
		]);
		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed).toMatchObject({
			uid: "todo-123",
			etag: '"abc123"',
			summary: "Updated",
			status: "NEEDS-ACTION",
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
		if (!handler) throw new Error("handler not registered");

		await expect(
			handler({ uid: "missing", calendarUrl: "/f/tasks/" }),
		).rejects.toThrow("Todo not found: missing");
		expect(mockClient.updateTodo).not.toHaveBeenCalled();
	});
});
