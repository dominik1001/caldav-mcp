import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock all dependencies before any imports
vi.mock("ts-caldav");
vi.mock("@modelcontextprotocol/sdk/server/stdio.js");
vi.mock("./server.js");

// Records whether stdio mode loads the HTTP stack (SDK streamableHttp and
// @hono/node-server); it should only be imported with --http.
const httpModule = vi.hoisted(() => ({ imported: false }));
vi.mock("./http-server.js", () => {
	httpModule.imported = true;
	return { startHttpServer: vi.fn() };
});

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
		vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

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

		// Mock the MCP server factory
		const { createServer } = await import("./server.js");
		vi.mocked(createServer).mockReturnValue({
			connect: vi.fn().mockResolvedValue(undefined),
		} as unknown as ReturnType<typeof createServer>);

		// Now import the main module which will execute
		await import("./index.js");

		// Wait a bit for async operations
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	it("should not write to console in success case", () => {
		// The main assertion: in a success case, there should be no console output
		// This test will FAIL if console.log or console.error is called
		expect(consoleLogSpy).not.toHaveBeenCalled();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it("does not load the HTTP server module in stdio mode", () => {
		expect(httpModule.imported).toBe(false);
	});

	it("MCP server was initialized successfully", () => {
		// This test passes if the server started without errors
		// The fact that we reached this point means the server initialized
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});
