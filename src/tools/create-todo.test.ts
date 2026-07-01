import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerCreateTodo } from "./create-todo.js";

type ToolHandler = (params: {
	summary: string;
	calendarUrl: string;
	due?: string;
	start?: string;
	description?: string;
	location?: string;
	status?: "NEEDS-ACTION" | "COMPLETED" | "IN-PROCESS" | "CANCELLED";
}) => Promise<{ content: { type: string; text: string }[] }>;

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "create-todo") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

function setup() {
	const mockClient = {
		createTodo: vi.fn().mockResolvedValue({ uid: "todo-123" }),
	};
	const { server, getHandler } = makeServer();
	registerCreateTodo(mockClient as unknown as CalDAVClient, server);
	const handler = getHandler();
	if (!handler) throw new Error("handler not registered");
	return { mockClient, handler };
}

describe("registerCreateTodo", () => {
	test("converts due from ISO string to Date and returns the uid", async () => {
		const { mockClient, handler } = setup();
		const dueIso = "2026-07-01T09:00:00.000Z";

		const result = await handler({
			summary: "Pay invoice",
			calendarUrl: "/f/tasks/",
			due: dueIso,
		});

		expect(result.content[0].text).toBe("todo-123");
		const passed = mockClient.createTodo.mock.calls[0]?.[1];
		expect(passed?.summary).toBe("Pay invoice");
		expect(passed?.due).toBeInstanceOf(Date);
		expect(passed?.due?.toISOString()).toBe(dueIso);
	});

	test("omits optional fields when not provided", async () => {
		const { mockClient, handler } = setup();

		await handler({ summary: "Just a title", calendarUrl: "/f/tasks/" });

		const passed = mockClient.createTodo.mock.calls[0]?.[1];
		expect(passed).not.toHaveProperty("due");
		expect(passed).not.toHaveProperty("start");
		expect(passed).not.toHaveProperty("status");
		expect(passed).not.toHaveProperty("description");
		expect(passed).not.toHaveProperty("location");
	});

	test("passes status when provided", async () => {
		const { mockClient, handler } = setup();

		await handler({
			summary: "In progress task",
			calendarUrl: "/f/tasks/",
			status: "IN-PROCESS",
		});

		const passed = mockClient.createTodo.mock.calls[0]?.[1];
		expect(passed?.status).toBe("IN-PROCESS");
	});
});
