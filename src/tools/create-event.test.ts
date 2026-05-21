import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerCreateEvent } from "./create-event.js";

type ToolHandler = (params: {
	summary: string;
	start: string;
	end: string;
	calendarUrl: string;
	wholeDay?: boolean;
	description?: string;
	location?: string;
	recurrenceRule?: {
		freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
		interval?: number;
		count?: number;
		until?: string;
		byday?: string[];
		bymonthday?: number[];
		bymonth?: number[];
	};
}) => Promise<{ content: { type: string; text: string }[] }>;

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "create-event") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

describe("registerCreateEvent", () => {
	test("converts recurrenceRule.until from ISO string to Date", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		const untilIso = "2026-05-15T10:00:00.000Z";
		await handler({
			summary: "Recurring",
			start: "2026-05-12T10:00:00.000Z",
			end: "2026-05-12T10:30:00.000Z",
			calendarUrl: "/f/test-calendar/",
			recurrenceRule: { freq: "DAILY", until: untilIso },
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule?.until).toBeInstanceOf(Date);
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(untilIso);
		expect(passed?.recurrenceRule?.freq).toBe("DAILY");
	});

	test("omits recurrenceRule when not provided", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		await handler({
			summary: "One-off",
			start: "2026-05-12T10:00:00.000Z",
			end: "2026-05-12T10:30:00.000Z",
			calendarUrl: "/f/test-calendar/",
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule).toBeUndefined();
	});

	test("passes wholeDay flag when provided", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		await handler({
			summary: "Whole day",
			start: "2026-05-12T00:00:00.000Z",
			end: "2026-05-13T00:00:00.000Z",
			calendarUrl: "/f/test-calendar/",
			wholeDay: true,
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.wholeDay).toBe(true);
	});
});
