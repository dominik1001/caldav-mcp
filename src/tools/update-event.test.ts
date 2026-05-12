import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import { registerUpdateEvent } from "./update-event.js";

type ToolHandler = (params: {
	uid: string;
	calendarUrl: string;
	summary?: string;
	start?: string;
	end?: string;
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

const existingEvent: Event = {
	uid: "event-123",
	href: "/f/test-calendar/event-123.ics",
	etag: '"abc123"',
	summary: "Original summary",
	start: new Date("2026-04-03T10:00:00Z"),
	end: new Date("2026-04-03T11:00:00Z"),
};

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "update-event") toolHandler = handler;
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;
	return { server, getHandler: () => toolHandler };
}

describe("registerUpdateEvent", () => {
	test("updates only the provided fields", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: "event-123",
				href: existingEvent.href,
				etag: '"new-etag"',
				newCtag: "",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler()!;

		const result = await handler({
			uid: "event-123",
			calendarUrl: "/f/test-calendar/",
			summary: "Updated summary",
		});

		expect(result.content[0].text).toBe("event-123");
		expect(mockClient.getEventsByHref).toHaveBeenCalledWith(
			"/f/test-calendar/",
			["/f/test-calendar/event-123.ics"],
		);
		expect(mockClient.updateEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			expect.objectContaining({
				uid: "event-123",
				etag: '"abc123"',
				summary: "Updated summary",
				start: existingEvent.start,
				end: existingEvent.end,
			}),
		);
	});

	test("throws when event is not found", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([]),
			updateEvent: vi.fn(),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler()!;

		await expect(
			handler({ uid: "missing", calendarUrl: "/f/test-calendar/" }),
		).rejects.toThrow("Event not found: missing");

		expect(mockClient.updateEvent).not.toHaveBeenCalled();
	});

	test("appends trailing slash to calendarUrl when building href", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: "event-123",
				href: existingEvent.href,
				etag: '"new-etag"',
				newCtag: "",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler()!;

		await handler({ uid: "event-123", calendarUrl: "/f/test-calendar" });

		expect(mockClient.getEventsByHref).toHaveBeenCalledWith(
			"/f/test-calendar",
			["/f/test-calendar/event-123.ics"],
		);
	});

	test("converts recurrenceRule.until from ISO string to Date", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: "event-123",
				href: existingEvent.href,
				etag: '"new-etag"',
				newCtag: "",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		const untilIso = "2026-05-15T10:00:00.000Z";
		await handler({
			uid: "event-123",
			calendarUrl: "/f/test-calendar/",
			recurrenceRule: { freq: "DAILY", until: untilIso },
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule?.until).toBeInstanceOf(Date);
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(untilIso);
		expect(passed?.recurrenceRule?.freq).toBe("DAILY");
	});
});
