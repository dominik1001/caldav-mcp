import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { registerListEvents } from "./list-events.js";

type ToolHandler = (params: {
	calendarUrl: string;
	start: string;
	end: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

describe("registerListEvents", () => {
	test("returns uid field for each event", async () => {
		// Create mock CalDAV client
		const mockClient = {
			getEvents: vi.fn().mockResolvedValue([
				{
					uid: "event-123",
					summary: "Test Event",
					start: new Date("2025-10-13T10:00:00Z"),
					end: new Date("2025-10-13T11:00:00Z"),
				},
				{
					uid: "event-456",
					summary: "Another Event",
					start: new Date("2025-10-14T14:00:00Z"),
					end: new Date("2025-10-14T15:00:00Z"),
				},
			]),
		};

		// Create mock MCP server with spied tool method
		let toolHandler: ToolHandler | null = null;
		const server = new McpServer({
			name: "test-server",
			version: "0.1.0",
		});

		// Spy on the tool registration to capture the handler
		const originalRegisterTool = server.registerTool.bind(server);
		server.registerTool = vi.fn(
			(name: string, config: unknown, handler: ToolHandler) => {
				if (name === "list-events") {
					toolHandler = handler;
				}
				return originalRegisterTool(name, config, handler);
			},
		) as typeof server.registerTool;

		// Register the tool
		registerListEvents(mockClient as CalDAVClient, server);

		// Verify handler was captured
		expect(toolHandler).toBeDefined();

		// Call the tool handler
		const result = await toolHandler({
			calendarUrl: "/test/calendar/",
			start: "2025-10-01T00:00:00Z",
			end: "2025-10-31T23:59:59Z",
		});

		// Parse the response
		const events = JSON.parse(result.content[0].text);

		// Verify uid is included in each event
		expect(events).toHaveLength(2);
		expect(events[0]).toHaveProperty("uid", "event-123");
		expect(events[0]).toHaveProperty("summary", "Test Event");
		expect(events[1]).toHaveProperty("uid", "event-456");
		expect(events[1]).toHaveProperty("summary", "Another Event");
	});

	test("includes description and location when present, omits them when absent", async () => {
		const mockClient = {
			getEvents: vi.fn().mockResolvedValue([
				{
					uid: "event-with-extras",
					summary: "Full Event",
					start: new Date("2025-10-13T10:00:00Z"),
					end: new Date("2025-10-13T11:00:00Z"),
					description: "Meeting notes",
					location: "Conference Room A",
				},
				{
					uid: "event-bare",
					summary: "Bare Event",
					start: new Date("2025-10-14T14:00:00Z"),
					end: new Date("2025-10-14T15:00:00Z"),
				},
			]),
		};

		let toolHandler: ToolHandler | null = null;
		const server = new McpServer({ name: "test-server", version: "0.1.0" });
		const originalRegisterTool = server.registerTool.bind(server);
		server.registerTool = vi.fn(
			(name: string, config: unknown, handler: ToolHandler) => {
				if (name === "list-events") toolHandler = handler;
				return originalRegisterTool(name, config, handler);
			},
		) as typeof server.registerTool;

		registerListEvents(mockClient as CalDAVClient, server);
		expect(toolHandler).toBeDefined();

		const result = await toolHandler({
			calendarUrl: "/test/calendar/",
			start: "2025-10-01T00:00:00Z",
			end: "2025-10-31T23:59:59Z",
		});

		const events = JSON.parse(result.content[0].text);
		expect(events[0]).toHaveProperty("description", "Meeting notes");
		expect(events[0]).toHaveProperty("location", "Conference Room A");
		expect(events[1]).not.toHaveProperty("description");
		expect(events[1]).not.toHaveProperty("location");
	});
});

describe("registerListEvents with whole-day events", () => {
	// ical.js turns a VALUE=DATE into a Date at local midnight, so east of UTC
	// the instant sits on the previous day. The zone is pinned because that is
	// exactly the condition under test: in UTC the bug cannot appear at all, and
	// the instants below are what a Berlin machine gets back for
	// DTSTART;VALUE=DATE:20260825 and friends.
	beforeAll(() => {
		vi.stubEnv("TZ", "Europe/Berlin");
	});
	afterAll(() => {
		vi.unstubAllEnvs();
	});

	async function listWholeDay(events: unknown[]) {
		const mockClient = { getEvents: vi.fn().mockResolvedValue(events) };
		let toolHandler: ToolHandler | null = null;
		const server = new McpServer({ name: "test-server", version: "0.1.0" });
		const originalRegisterTool = server.registerTool.bind(server);
		server.registerTool = vi.fn(
			(name: string, config: unknown, handler: ToolHandler) => {
				if (name === "list-events") toolHandler = handler;
				return originalRegisterTool(name, config, handler);
			},
		) as typeof server.registerTool;

		registerListEvents(mockClient as unknown as CalDAVClient, server);
		if (!toolHandler) throw new Error("handler not registered");

		const result = await toolHandler({
			calendarUrl: "/test/calendar/",
			start: "2026-08-01T00:00:00Z",
			end: "2026-11-01T00:00:00Z",
		});
		return JSON.parse(result.content[0].text);
	}

	test("reports a multi-day event as calendar dates, last day included", async () => {
		const events = await listWholeDay([
			{
				uid: "holiday",
				summary: "Family visit",
				// DTSTART;VALUE=DATE:20260825, DTEND;VALUE=DATE:20260830
				start: new Date("2026-08-24T22:00:00Z"),
				end: new Date("2026-08-29T22:00:00Z"),
				wholeDay: true,
			},
		]);

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			start: "2026-08-25",
			end: "2026-08-29",
			wholeDay: true,
		});
	});

	test("reports a one-day event with start and end on the same date", async () => {
		const events = await listWholeDay([
			{
				uid: "single",
				summary: "Public holiday",
				start: new Date("2026-08-24T22:00:00Z"),
				end: new Date("2026-08-25T22:00:00Z"),
				wholeDay: true,
			},
		]);

		expect(events[0]).toMatchObject({ start: "2026-08-25", end: "2026-08-25" });
	});

	test("keeps start and end together when DTEND is missing", async () => {
		const events = await listWholeDay([
			{
				uid: "no-dtend",
				summary: "Birthday",
				start: new Date("2026-08-24T22:00:00Z"),
				end: new Date("2026-08-24T22:00:00Z"),
				wholeDay: true,
			},
		]);

		expect(events[0]).toMatchObject({ start: "2026-08-25", end: "2026-08-25" });
	});

	test("counts days across a daylight saving change", async () => {
		const events = await listWholeDay([
			{
				uid: "dst",
				summary: "Autumn break",
				// 24 to 28 October: CEST at the start, CET at the end, so the raw
				// difference is five days plus the hour the clock change adds.
				start: new Date("2026-10-23T22:00:00Z"),
				end: new Date("2026-10-28T23:00:00Z"),
				wholeDay: true,
			},
		]);

		expect(events[0]).toMatchObject({ start: "2026-10-24", end: "2026-10-28" });
	});

	test("leaves a timed event as an ISO instant with no wholeDay flag", async () => {
		const events = await listWholeDay([
			{
				uid: "timed",
				summary: "Doctor",
				start: new Date("2026-08-24T14:00:00Z"),
				end: new Date("2026-08-24T14:30:00Z"),
			},
		]);

		expect(events[0].start).toBe("2026-08-24T14:00:00.000Z");
		expect(events[0]).not.toHaveProperty("wholeDay");
	});
});
