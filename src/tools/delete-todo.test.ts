import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerDeleteTodo } from "./delete-todo.js";

type ToolHandler = (params: {
	uid: string;
	calendarUrl: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "delete-todo") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

describe("registerDeleteTodo", () => {
	test("looks up the etag by href and deletes the todo", async () => {
		const mockClient = {
			getETag: vi.fn().mockResolvedValue('"etag-1"'),
			deleteTodo: vi.fn().mockResolvedValue(undefined),
		};
		const { server, getHandler } = makeServer();
		registerDeleteTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		const result = await handler({ uid: "todo-123", calendarUrl: "/f/tasks" });

		expect(mockClient.getETag).toHaveBeenCalledWith("/f/tasks/todo-123.ics");
		expect(mockClient.deleteTodo).toHaveBeenCalledWith(
			"/f/tasks",
			"todo-123",
			'"etag-1"',
		);
		expect(result.content[0].text).toBe("Todo deleted");
	});

	test("propagates a getETag failure without attempting the delete", async () => {
		const mockClient = {
			getETag: vi.fn().mockRejectedValue(new Error("404 Not Found")),
			deleteTodo: vi.fn(),
		};
		const { server, getHandler } = makeServer();
		registerDeleteTodo(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		await expect(
			handler({ uid: "missing", calendarUrl: "/f/tasks" }),
		).rejects.toThrow("404 Not Found");
		expect(mockClient.deleteTodo).not.toHaveBeenCalled();
	});
});
