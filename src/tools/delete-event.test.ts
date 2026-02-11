import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerDeleteEvent } from "./delete-event.js";

type ToolHandler = (params: {
	calendarUrl: string;
	uid: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

describe("registerDeleteEvent", () => {
	test("successfully deletes event when server returns 204", async () => {
		// Create mock CalDAV client that returns 204 (No Content)
		const mockClient = {
			deleteEvent: vi.fn().mockResolvedValue(undefined),
		};

		let toolHandler: ToolHandler | null = null;
		const server = new McpServer({
			name: "test-server",
			version: "0.1.0",
		});

		const originalRegisterTool = server.registerTool.bind(server);
		server.registerTool = vi.fn(
			(name: string, config: unknown, handler: ToolHandler) => {
				if (name === "delete-event") {
					toolHandler = handler;
				}
				return originalRegisterTool(name, config, handler);
			},
		) as typeof server.registerTool;

		registerDeleteEvent(mockClient as CalDAVClient, server);

		expect(toolHandler).toBeDefined();

		const result = await toolHandler({
			calendarUrl: "/f/test-calendar/",
			uid: "event-123",
		});

		expect(result.content[0].text).toBe("Event deleted");
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			"event-123",
		);
	});

	test("successfully deletes event when server returns 200", async () => {
		// Create mock CalDAV client
		// In practice, ts-caldav should accept both 200 and 204 status codes
		const mockClient = {
			deleteEvent: vi.fn().mockResolvedValue(undefined),
		};

		let toolHandler: ToolHandler | null = null;
		const server = new McpServer({
			name: "test-server",
			version: "0.1.0",
		});

		const originalRegisterTool = server.registerTool.bind(server);
		server.registerTool = vi.fn(
			(name: string, config: unknown, handler: ToolHandler) => {
				if (name === "delete-event") {
					toolHandler = handler;
				}
				return originalRegisterTool(name, config, handler);
			},
		) as typeof server.registerTool;

		registerDeleteEvent(mockClient as CalDAVClient, server);

		expect(toolHandler).toBeDefined();

		const result = await toolHandler({
			calendarUrl: "/f/test-calendar/",
			uid: "event-456",
		});

		expect(result.content[0].text).toBe("Event deleted");
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			"event-456",
		);
	});
});
