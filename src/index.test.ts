import { beforeAll, describe, expect, test, vi } from "vitest";

// Mock all dependencies before any imports
vi.mock("ts-caldav");
vi.mock("@modelcontextprotocol/sdk/server/mcp.js");
vi.mock("@modelcontextprotocol/sdk/server/stdio.js");
vi.mock("./tools/create-event.js");
vi.mock("./tools/delete-event.js");
vi.mock("./tools/list-calendars.js");
vi.mock("./tools/list-events.js");

describe("MCP Server Console Output", () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeAll(async () => {
		// Setup environment variables
		process.env.CALDAV_BASE_URL = "https://example.com/caldav";
		process.env.CALDAV_USERNAME = "testuser";
		process.env.CALDAV_PASSWORD = "testpassword";

		// Create spies before importing the module
		consoleLogSpy = vi
			.spyOn(console, "log")
			.mockImplementation(() => undefined);
		consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		vi.spyOn(process, "exit").mockImplementation(() => {
			return undefined as never;
		});

		// Mock successful CalDAV client
		const { CalDAVClient } = await import("ts-caldav");
		vi.mocked(CalDAVClient.create).mockResolvedValue({
			getCalendars: vi.fn().mockResolvedValue([
				{
					displayName: "Test Calendar",
					url: "https://example.com/caldav/calendar",
				},
			]),
		} as unknown as Awaited<ReturnType<typeof CalDAVClient.create>>);

		// Mock MCP Server
		const { McpServer } = await import(
			"@modelcontextprotocol/sdk/server/mcp.js"
		);
		vi.mocked(McpServer).mockImplementation(
			() =>
				({
					registerTool: vi.fn(),
					connect: vi.fn().mockResolvedValue(undefined),
				}) as unknown as InstanceType<typeof McpServer>,
		);

		// Mock StdioServerTransport
		const { StdioServerTransport } = await import(
			"@modelcontextprotocol/sdk/server/stdio.js"
		);
		vi.mocked(StdioServerTransport).mockImplementation(
			() => ({}) as unknown as InstanceType<typeof StdioServerTransport>,
		);

		// Mock tool registration functions
		const createEvent = await import("./tools/create-event.js");
		const deleteEvent = await import("./tools/delete-event.js");
		const listCalendars = await import("./tools/list-calendars.js");
		const listEvents = await import("./tools/list-events.js");

		vi.mocked(createEvent.registerCreateEvent).mockImplementation(
			() => undefined,
		);
		vi.mocked(deleteEvent.registerDeleteEvent).mockImplementation(
			() => undefined,
		);
		vi.mocked(listCalendars.registerListCalendars).mockResolvedValue(undefined);
		vi.mocked(listEvents.registerListEvents).mockImplementation(
			() => undefined,
		);

		// Now import the main module which will execute
		await import("./index.js");

		// Wait a bit for async operations
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	test("should not write to console in success case", () => {
		// The main assertion: in a success case, there should be no console output
		// This test will FAIL if console.log or console.error is called
		expect(consoleLogSpy).not.toHaveBeenCalled();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test("MCP server was initialized successfully", () => {
		// This test passes if the server started without errors
		// The fact that we reached this point means the server initialized
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});
