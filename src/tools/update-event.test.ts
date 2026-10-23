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

const existingEvent: Event = {
	uid: "event-123",
	href: "/f/test-calendar/event-123.ics",
	etag: '"abc123"',
	summary: "Original summary",
	start: new Date("2026-04-03T10:00:00Z"),
	end: new Date("2026-04-03T11:00:00Z"),
};

// ts-caldav hands a VALUE=DATE back as local midnight, with an exclusive end:
// this is a trip from 2026-08-18 to 2026-08-22, stored as DTEND 2026-08-23.
const wholeDayEvent: Event = {
	uid: "trip-1",
	href: "/f/test-calendar/trip-1.ics",
	etag: '"trip"',
	summary: "Trip",
	start: new Date(2026, 7, 18),
	end: new Date(2026, 7, 23),
	wholeDay: true,
};

// The writer stores a whole-day date as the toISOString() day of the Date.
const storedDay = (date: Date | undefined) => date?.toISOString().slice(0, 10);

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
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

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
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

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
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		await handler({ uid: "event-123", calendarUrl: "/f/test-calendar" });

		expect(mockClient.getEventsByHref).toHaveBeenCalledWith(
			"/f/test-calendar",
			["/f/test-calendar/event-123.ics"],
		);
	});

	test("keeps the UNTIL of a whole-day series when another field changes", async () => {
		const series: Event = {
			...wholeDayEvent,
			recurrenceRule: { freq: "YEARLY", until: new Date(2030, 7, 18) },
		};
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([series]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: "trip-1",
				href: series.href,
				etag: '"new-etag"',
				newCtag: "",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		await handler({
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(storedDay(passed?.recurrenceRule?.until)).toBe("2030-08-18");
	});

	test("reads an explicit whole-day end as the day it names", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([wholeDayEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: "trip-1",
				href: wholeDayEvent.href,
				etag: '"new-etag"',
				newCtag: "",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");

		// Extend the trip to the 25th, written the way a caller in Berlin would.
		await handler({
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			end: "2026-08-25T00:00:00+02:00",
		});

		// The end is inclusive (see the tool description), so the stored event
		// must run from the 18th through the 25th.
		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(storedDay(passed?.start)).toBe("2026-08-18");
		expect(storedDay(passed?.end)).toBe("2026-08-25");
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

	test("turns a timed event into a whole-day event on the same day", async () => {
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

		await handler({
			uid: "event-123",
			calendarUrl: "/f/test-calendar/",
			wholeDay: true,
		});

		// The writer stores the toISOString() day of start and end, and treats
		// end as the last day of the event. Both must be 2026-04-03, or the
		// event ends up with DTEND <= DTSTART.
		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString().slice(0, 10)).toBe("2026-04-03");
		expect(passed?.end.toISOString().slice(0, 10)).toBe("2026-04-03");
	});

	test("updates wholeDay flag when provided", async () => {
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

		await handler({
			uid: "event-123",
			calendarUrl: "/f/test-calendar/",
			wholeDay: true,
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.wholeDay).toBe(true);
	});
});
