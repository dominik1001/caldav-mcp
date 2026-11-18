import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ts-caldav");
vi.mock("@modelcontextprotocol/sdk/server/stdio.js");
vi.mock("./server.js");
vi.mock("./http-server.js");

const ORIGINAL_ARGV = process.argv;

type FakeServer = Record<string, unknown>;

const fakeServer = (): FakeServer => ({
	address: () => ({ address: "127.0.0.1", family: "IPv4", port: 4321 }),
	close: vi.fn(),
	closeIdleConnections: vi.fn(),
});

/** Imports index.ts afresh in HTTP mode with the given extra env. */
async function runIndex(
	env: Record<string, string>,
	started: () => Promise<FakeServer> = () => Promise.resolve(fakeServer())
) {
	vi.resetModules();
	process.argv = ["node", "dist/index.js", "--http"];
	vi.stubEnv("CALDAV_BASE_URL", "https://example.com/caldav");
	vi.stubEnv("CALDAV_USERNAME", "testuser");
	vi.stubEnv("CALDAV_PASSWORD", "testpassword");
	vi.stubEnv("MCP_HOST", "");
	vi.stubEnv("MCP_PORT", "");
	vi.stubEnv("PORT", "");
	vi.stubEnv("MCP_AUTH_TOKEN", "");
	for (const [key, value] of Object.entries(env)) {
		vi.stubEnv(key, value);
	}

	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);
	const consoleLog = vi
		.spyOn(console, "log")
		.mockImplementation(() => undefined);
	const exit = vi
		.spyOn(process, "exit")
		.mockImplementation(() => undefined as never);
	const signalHandlers = new Map<string, () => void>();
	vi.spyOn(process, "once").mockImplementation(((
		event: string,
		handler: () => void
	) => {
		signalHandlers.set(event, handler);
		return process;
	}) as typeof process.once);

	const { CalDAVClient } = await import("ts-caldav");
	vi.mocked(CalDAVClient.create).mockResolvedValue({
		getCalendars: vi.fn().mockResolvedValue([]),
	} as unknown as Awaited<ReturnType<typeof CalDAVClient.create>>);
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const { startHttpServer } = await import("./http-server.js");
	vi.mocked(startHttpServer).mockImplementation(
		started as unknown as typeof startHttpServer
	);

	await import("./index.js");

	return {
		CalDAVClient,
		consoleError,
		consoleLog,
		exit,
		signalHandlers,
		StdioServerTransport,
		startHttpServer,
	};
}

describe("index --http", () => {
	afterEach(() => {
		process.argv = ORIGINAL_ARGV;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("starts the HTTP server instead of stdio when --http is passed", async () => {
		const { StdioServerTransport, startHttpServer } = await runIndex({
			MCP_AUTH_TOKEN: "t",
		});

		await vi.waitFor(() => {
			expect(startHttpServer).toHaveBeenCalledWith(
				{ authToken: "t", host: "127.0.0.1", port: 3000 },
				expect.any(Function)
			);
		});
		expect(StdioServerTransport).not.toHaveBeenCalled();
	});

	it("logs the listening URL to stderr", async () => {
		const { consoleError, consoleLog } = await runIndex({});

		await vi.waitFor(() => {
			expect(consoleError).toHaveBeenCalledWith(
				"caldav-mcp listening on http://127.0.0.1:4321/mcp"
			);
		});
		expect(consoleLog).not.toHaveBeenCalled();
	});

	it("exits 1 with the config error before connecting to CalDAV", async () => {
		const { CalDAVClient, consoleError, exit } = await runIndex({
			MCP_HOST: "0.0.0.0",
		});

		await vi.waitFor(() => {
			expect(exit).toHaveBeenCalledWith(1);
		});
		expect(consoleError).toHaveBeenCalledWith(
			"MCP_AUTH_TOKEN is required when MCP_HOST is not a loopback address"
		);
		expect(CalDAVClient.create).not.toHaveBeenCalled();
	});

	it("shuts down on SIGTERM even where closeIdleConnections is missing (Node <18.2)", async () => {
		const server = fakeServer();
		server.closeIdleConnections = undefined;
		const { signalHandlers } = await runIndex({}, () =>
			Promise.resolve(server)
		);
		await vi.waitFor(() => {
			expect(signalHandlers.has("SIGTERM")).toBe(true);
		});

		expect(() => signalHandlers.get("SIGTERM")?.()).not.toThrow();
		expect(server.close).toHaveBeenCalled();
	});

	it("exits 1 with a one-line message when the port is in use", async () => {
		const { consoleError, exit } = await runIndex({}, () =>
			Promise.reject(
				new Error("listen EADDRINUSE: address already in use 127.0.0.1:3000")
			)
		);

		await vi.waitFor(() => {
			expect(exit).toHaveBeenCalledWith(1);
		});
		expect(consoleError).toHaveBeenCalledWith(
			"caldav-mcp: failed to start: listen EADDRINUSE: address already in use 127.0.0.1:3000"
		);
	});
});
