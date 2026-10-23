import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerCompleteTodo } from "./complete-todo.js";
import { registerCreateEvent } from "./create-event.js";
import { registerCreateTodo } from "./create-todo.js";
import { registerDeleteEvent } from "./delete-event.js";
import { registerDeleteTodo } from "./delete-todo.js";
import { registerListEvents } from "./list-events.js";
import { registerListTodos } from "./list-todos.js";
import { registerUpdateEvent } from "./update-event.js";
import { registerUpdateTodo } from "./update-todo.js";

// list-calendars hands out absolute URLs while older callers may still hold
// server-relative ones. Every tool must make the same ts-caldav calls for both
// forms: ts-caldav writes object hrefs into calendar-multiget bodies verbatim,
// and not every server accepts absolute URLs there.

const baseUrl = "https://cloud.example.com/remote.php/dav";
const calendarPath = "/remote.php/dav/calendars/user/personal/";
const absoluteUrl = `https://cloud.example.com${calendarPath}`;

type Register = (client: CalDAVClient, server: McpServer) => void;
type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const start = "2026-01-01T10:00:00Z";
const end = "2026-01-01T11:00:00Z";

const tools: [string, Register, Record<string, unknown>][] = [
	["create-event", registerCreateEvent, { end, start, summary: "s" }],
	["list-events", registerListEvents, { end, start }],
	["update-event", registerUpdateEvent, { summary: "s2", uid: "u1" }],
	["delete-event", registerDeleteEvent, { uid: "u1" }],
	["create-todo", registerCreateTodo, { summary: "s" }],
	["list-todos", registerListTodos, {}],
	["update-todo", registerUpdateTodo, { summary: "s2", uid: "u1" }],
	["complete-todo", registerCompleteTodo, { uid: "u1" }],
	["delete-todo", registerDeleteTodo, { uid: "u1" }],
];

function mockClient() {
	return {
		baseUrl,
		createEvent: vi.fn().mockResolvedValue({ uid: "u1" }),
		createTodo: vi.fn().mockResolvedValue({ uid: "u1" }),
		deleteEvent: vi.fn().mockResolvedValue(undefined),
		deleteTodo: vi.fn().mockResolvedValue(undefined),
		getETag: vi.fn().mockResolvedValue('"etag"'),
		getEvents: vi.fn().mockResolvedValue([]),
		getEventsByHref: vi
			.fn()
			.mockResolvedValue([
				{ end: new Date(end), start: new Date(start), summary: "s", uid: "u1" },
			]),
		getTodos: vi.fn().mockResolvedValue([]),
		getTodosByHref: vi.fn().mockResolvedValue([{ summary: "s", uid: "u1" }]),
		updateEvent: vi.fn().mockResolvedValue({ uid: "u1" }),
		updateTodo: vi.fn().mockResolvedValue({ uid: "u1" }),
	};
}

async function callsFor(
	register: Register,
	args: Record<string, unknown>,
	calendarUrl: string
) {
	const client = mockClient();
	let handler: Handler | undefined;
	const server = {
		registerTool: (_name: string, _config: unknown, h: Handler) => {
			handler = h;
		},
	};
	register(client as unknown as CalDAVClient, server as unknown as McpServer);
	if (!handler) {
		throw new Error("tool was not registered");
	}
	await handler({ ...args, calendarUrl });

	const { baseUrl: _, ...methods } = client;
	return Object.fromEntries(
		Object.entries(methods)
			.filter(([, fn]) => fn.mock.calls.length > 0)
			.map(([name, fn]) => [name, fn.mock.calls])
	);
}

describe("calendarUrl handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test.each(tools)(
		"%s makes the same ts-caldav calls for absolute and relative URLs",
		async (_name, register, args) => {
			const relative = await callsFor(register, args, calendarPath);
			const absolute = await callsFor(register, args, absoluteUrl);

			expect(Object.keys(relative).length).toBeGreaterThan(0);
			expect(absolute).toEqual(relative);
			expect(JSON.stringify(absolute)).not.toContain("https://");
		}
	);

	test.each(tools)(
		"%s leaves a URL on another server untouched",
		async (_name, register, args) => {
			const foreign = "https://other.example.com/cal/";
			const calls = await callsFor(register, args, foreign);

			expect(JSON.stringify(calls)).toContain(foreign);
		}
	);
});
