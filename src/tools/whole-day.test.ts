import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { describe, expect, test } from "vitest";
import { registerCreateEvent } from "./create-event.js";
import { registerListEvents } from "./list-events.js";
import { registerUpdateEvent } from "./update-event.js";

const MENTIONS_WHOLE_DAY = /whole-day|wholeDay/i;

// What the CalDAV server stores for a whole-day event: VALUE=DATE days, with
// an exclusive DTEND.
interface Stored {
	dtend: string;
	dtstart: string;
	summary: string;
	uid: string;
}

const utcDay = (date: Date) =>
	date.toISOString().slice(0, 10).replaceAll("-", "");

function addDay(day: string): string {
	const date = new Date(
		`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`
	);
	date.setUTCDate(date.getUTCDate() + 1);
	return utcDay(date);
}

const localMidnight = (day: string) =>
	new Date(
		Number(day.slice(0, 4)),
		Number(day.slice(4, 6)) - 1,
		Number(day.slice(6, 8))
	);

// A calendar that reads and writes whole-day events the way ts-caldav 0.4.4
// does: a VALUE=DATE is read as local midnight with the exclusive DTEND as
// is, and written as the UTC day of the Date, with `end` taken as the last
// day.
function fakeCalendar(initial: Stored[] = []) {
	const events = new Map(initial.map((e) => [e.uid, { ...e }]));

	const read = (e: Stored): Event => ({
		end: localMidnight(e.dtend),
		etag: '"1"',
		href: `/cal/${e.uid}.ics`,
		start: localMidnight(e.dtstart),
		summary: e.summary,
		uid: e.uid,
		wholeDay: true,
	});
	const write = (uid: string, event: Partial<Event>) => {
		if (!(event.wholeDay && event.start)) {
			throw new Error("whole-day only");
		}
		const dtstart = utcDay(event.start);
		events.set(uid, {
			dtend: addDay(event.end ? utcDay(event.end) : dtstart),
			dtstart,
			summary: event.summary ?? "",
			uid,
		});
		return { etag: '"2"', href: `/cal/${uid}.ics`, newCtag: "", uid };
	};

	const client = {
		createEvent: async (_url: string, event: Partial<Event>) =>
			write("new-1", event),
		getEvents: async () => [...events.values()].map(read),
		getEventsByHref: async (_url: string, hrefs: string[]) =>
			[...events.values()]
				.filter((e) => hrefs.some((h) => h.endsWith(`/${e.uid}.ics`)))
				.map(read),
		updateEvent: async (_url: string, event: Event) => write(event.uid, event),
	};
	return { client: client as unknown as CalDAVClient, events };
}

async function connect(client: CalDAVClient) {
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	registerCreateEvent(client, server);
	registerListEvents(client, server);
	registerUpdateEvent(client, server);
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const mcp = new Client({ name: "test-client", version: "0.1.0" });
	await mcp.connect(clientSide);
	return mcp;
}

async function call(mcp: Client, name: string, args: Record<string, unknown>) {
	const result = await mcp.callTool({ arguments: args, name });
	const [first] = result.content as { type: string; text: string }[];
	if (result.isError) {
		throw new Error(`${name} failed: ${first?.text}`);
	}
	return first?.text ?? "";
}

// A trip from 2026-08-25 through 2026-08-29.
const trip: Stored = {
	dtend: "20260830",
	dtstart: "20260825",
	summary: "Trip",
	uid: "trip-1",
};

// The `test.fails` cases are known bugs (see PR #100's review). Each one
// flips to a failure once its bug is fixed; then drop `.fails`.
describe("whole-day events through the MCP client", () => {
	test("create-event stores the day named in a UTC date", async () => {
		const { client, events } = fakeCalendar();
		const mcp = await connect(client);

		await call(mcp, "create-event", {
			calendarUrl: "/cal/",
			end: "2026-08-25T00:00:00Z",
			start: "2026-08-25T00:00:00Z",
			summary: "Holiday",
			wholeDay: true,
		});

		expect(events.get("new-1")).toMatchObject({
			dtend: "20260826",
			dtstart: "20260825",
		});
	});

	test("create-event stores the day named in a date with an offset", async () => {
		const { client, events } = fakeCalendar();
		const mcp = await connect(client);

		// Midnight in Berlin, the way a caller there would write the 25th.
		await call(mcp, "create-event", {
			calendarUrl: "/cal/",
			end: "2026-08-25T00:00:00+02:00",
			start: "2026-08-25T00:00:00+02:00",
			summary: "Holiday",
			wholeDay: true,
		});

		expect(events.get("new-1")).toMatchObject({
			dtend: "20260826",
			dtstart: "20260825",
		});
	});

	test("update-event keeps the days when only the summary changes", async () => {
		const { client, events } = fakeCalendar([trip]);
		const mcp = await connect(client);

		await call(mcp, "update-event", {
			calendarUrl: "/cal/",
			summary: "Trip to Rome",
			uid: "trip-1",
		});

		expect(events.get("trip-1")).toMatchObject({
			dtend: "20260830",
			dtstart: "20260825",
			summary: "Trip to Rome",
		});
	});

	test.fails("dates from list-events can be passed back to update-event as they are", async () => {
		const { client, events } = fakeCalendar([trip]);
		const mcp = await connect(client);

		const [listed] = JSON.parse(
			await call(mcp, "list-events", {
				calendarUrl: "/cal/",
				end: "2026-09-01T00:00:00Z",
				start: "2026-08-01T00:00:00Z",
			})
		);
		await call(mcp, "update-event", {
			calendarUrl: "/cal/",
			end: listed.end,
			start: listed.start,
			summary: "Trip to Rome",
			uid: listed.uid,
			wholeDay: true,
		});

		expect(events.get("trip-1")).toMatchObject({
			dtend: "20260830",
			dtstart: "20260825",
		});
	});

	test.fails("the list-events description the client sees explains whole-day dates", async () => {
		const { client } = fakeCalendar();
		const mcp = await connect(client);

		const { tools } = await mcp.listTools();
		const listEvents = tools.find((t) => t.name === "list-events");

		expect(listEvents?.description).toMatch(MENTIONS_WHOLE_DAY);
	});
});
