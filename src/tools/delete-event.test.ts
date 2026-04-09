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
		const mockClient = {
			getETag: vi.fn().mockResolvedValue('"abc123"'),
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

		registerDeleteEvent(mockClient as unknown as CalDAVClient, server);

		expect(toolHandler).toBeDefined();

		const result = await toolHandler({
			calendarUrl: "/f/test-calendar/",
			uid: "event-123",
		});

		expect(result.content[0].text).toBe("Event deleted");
		expect(mockClient.getETag).toHaveBeenCalledWith(
			"/f/test-calendar/event-123.ics",
		);
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			"event-123",
			'"abc123"',
		);
	});

	test("fetches etag before deleting and passes it to deleteEvent", async () => {
		const mockClient = {
			getETag: vi.fn().mockResolvedValue('"etag-from-server"'),
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

		registerDeleteEvent(mockClient as unknown as CalDAVClient, server);

		await toolHandler({
			calendarUrl: "/cal/work/",
			uid: "meeting-42",
		});

		// etag must be fetched from the constructed href
		expect(mockClient.getETag).toHaveBeenCalledWith("/cal/work/meeting-42.ics");

		// the fetched etag is forwarded to deleteEvent (not "*")
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"/cal/work/",
			"meeting-42",
			'"etag-from-server"',
		);

		// getETag is called before deleteEvent
		const etagOrder = mockClient.getETag.mock.invocationCallOrder[0];
		const deleteOrder = mockClient.deleteEvent.mock.invocationCallOrder[0];
		expect(etagOrder).toBeLessThan(deleteOrder);
	});

	test("successfully deletes event when server returns 200", async () => {
		const mockClient = {
			getETag: vi.fn().mockResolvedValue('"def456"'),
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

		registerDeleteEvent(mockClient as unknown as CalDAVClient, server);

		expect(toolHandler).toBeDefined();

		const result = await toolHandler({
			calendarUrl: "/f/test-calendar",
			uid: "event-456",
		});

		expect(result.content[0].text).toBe("Event deleted");
		expect(mockClient.getETag).toHaveBeenCalledWith(
			"/f/test-calendar/event-456.ics",
		);
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"/f/test-calendar",
			"event-456",
			'"def456"',
		);
	});
});
