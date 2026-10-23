import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
	test("preserves the calendar date when updating a whole-day event with a positive UTC offset", async () => {
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
			start: "2026-09-30T00:00:00+09:00",
			end: "2026-09-30T00:00:00+09:00",
			recurrenceRule: { freq: "YEARLY", until: "2030-09-30T00:00:00+09:00" },
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(
			"2030-09-30T00:00:00.000Z",
		);
	});

	test("keeps treating start/end as whole-day when wholeDay isn't passed but the existing event is whole-day", async () => {
		const existingWholeDayEvent: Event = {
			...existingEvent,
			wholeDay: true,
		};
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingWholeDayEvent]),
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
			start: "2026-09-30T00:00:00+09:00",
			end: "2026-09-30T00:00:00+09:00",
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
	});
});

describe("registerUpdateEvent whole-day handling", () => {
	// A VALUE=DATE reaches us as local midnight; pin a zone east of UTC so
	// that local midnight is the previous day in UTC. Pinned here rather than
	// relying on the global TZ in vitest.config.ts, so these tests keep
	// exercising the shift even if that default changes.
	beforeEach(() => {
		vi.stubEnv("TZ", "Europe/Berlin");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// Built per test so the fixture is read in the stubbed zone.
	const wholeDayEvent = (): Event => ({
		uid: "trip-1",
		href: "/f/test-calendar/trip-1.ics",
		etag: '"trip"',
		summary: "Trip",
		start: new Date(2026, 7, 18),
		end: new Date(2026, 7, 23),
		wholeDay: true,
	});

	async function run(event: Event, args: Parameters<ToolHandler>[0]) {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([event]),
			updateEvent: vi.fn().mockResolvedValue({
				uid: event.uid,
				href: event.href,
				etag: '"new"',
				newCtag: "",
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) throw new Error("handler not registered");
		await handler(args);
		return mockClient;
	}

	// Serialize the way ts-caldav does: VALUE=DATE from toISOString(), and
	// DTEND = inclusive end + 1 day.
	const asDate = (d: Date) => d.toISOString().slice(0, 10);
	const asExclusiveEnd = (d: Date) =>
		asDate(new Date(d.getTime() + 24 * 60 * 60 * 1000));

	test("writes back the stored DTSTART and DTEND when only the location changes", async () => {
		const client = await run(wholeDayEvent(), {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.location).toBe("Somewhere else");
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-23");
	});

	test("keeps RRULE UNTIL, EXDATE, RDATE and RECURRENCE-ID on their days when only the location changes", async () => {
		const yearly: Event = {
			...wholeDayEvent(),
			start: new Date(2026, 8, 30),
			end: new Date(2026, 9, 1),
			recurrenceRule: { freq: "YEARLY", until: new Date(2030, 8, 30) },
			exdates: [new Date(2027, 8, 30)],
			rdates: [new Date(2027, 9, 2)],
			recurrenceId: new Date(2028, 8, 30),
		};
		const client = await run(yearly, {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-09-30");
		expect(asExclusiveEnd(payload.end)).toBe("2026-10-01");
		expect(payload.recurrenceRule.freq).toBe("YEARLY");
		expect(asDate(payload.recurrenceRule.until)).toBe("2030-09-30");
		expect(payload.exdates.map(asDate)).toEqual(["2027-09-30"]);
		expect(payload.rdates.map(asDate)).toEqual(["2027-10-02"]);
		expect(asDate(payload.recurrenceId)).toBe("2028-09-30");
	});

	test("keeps a zero-length whole-day event (DTEND equal to DTSTART) a valid range", async () => {
		const zeroLength: Event = {
			...wholeDayEvent(),
			end: new Date(2026, 7, 18),
		};
		const client = await run(zeroLength, {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asDate(payload.end)).toBe("2026-08-18");
	});

	test("turns a timed event into a whole-day event on its local day", async () => {
		// 00:30 to 01:30 in Berlin, still the 17th in UTC.
		const lateNight: Event = {
			...wholeDayEvent(),
			start: new Date("2026-08-18T00:30:00+02:00"),
			end: new Date("2026-08-18T01:30:00+02:00"),
			wholeDay: false,
		};
		const client = await run(lateNight, {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			wholeDay: true,
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.wholeDay).toBe(true);
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-19");
	});

	test("keeps a timed event that ends at midnight on one day when it becomes whole-day", async () => {
		const toMidnight: Event = {
			...wholeDayEvent(),
			start: new Date("2026-08-18T23:00:00+02:00"),
			end: new Date("2026-08-19T00:00:00+02:00"),
			wholeDay: false,
		};
		const client = await run(toMidnight, {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			wholeDay: true,
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-19");
	});

	test("converts an explicitly given date to its calendar day", async () => {
		const client = await run(wholeDayEvent(), {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			start: "2026-09-01T00:00:00+02:00",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.start).toEqual(new Date("2026-09-01T00:00:00.000Z"));
		expect(payload.end).toEqual(new Date(Date.UTC(2026, 7, 22)));
	});

	test("does not touch the dates of a timed event", async () => {
		const timed: Event = { ...wholeDayEvent(), wholeDay: false };
		const client = await run(timed, {
			uid: "trip-1",
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
		});

		expect(client.updateEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			expect.objectContaining({ start: timed.start, end: timed.end }),
		);
	});
});
