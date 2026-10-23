import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Todo } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerCompleteTodo } from "./complete-todo.js";

type ToolHandler = (params: {
	uid: string;
	calendarUrl: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

const existingTodo: Todo = {
	etag: '"abc123"',
	href: "/f/tasks/todo-123.ics",
	status: "NEEDS-ACTION",
	summary: "Finish report",
	uid: "todo-123",
};

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "complete-todo") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		}
	) as typeof server.registerTool;
	return { getHandler: () => toolHandler, server };
}

describe("registerCompleteTodo", () => {
	test("sets status COMPLETED and a completed timestamp", async () => {
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
		registerCompleteTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const result = await handler({ calendarUrl: "/f/tasks/", uid: "todo-123" });

		expect(result.content[0].text).toBe("todo-123");
		const passed = mockClient.updateTodo.mock.calls[0]?.[1];
		expect(passed.status).toBe("COMPLETED");
		expect(passed.completed).toBeInstanceOf(Date);
		expect(passed.summary).toBe("Finish report");
	});

	test("throws when the todo is not found", async () => {
		const mockClient = {
			getTodosByHref: vi.fn().mockResolvedValue([]),
			updateTodo: vi.fn(),
		};
		const { server, getHandler } = makeServer();
		registerCompleteTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await expect(
			handler({ calendarUrl: "/f/tasks/", uid: "missing" })
		).rejects.toThrow("Todo not found: missing");
		expect(mockClient.updateTodo).not.toHaveBeenCalled();
	});
});
