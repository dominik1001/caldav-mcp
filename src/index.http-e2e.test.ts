import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only CalDAV is faked: index.ts, the HTTP server and the MCP server are real.
vi.mock("ts-caldav");

const LISTENING = /listening on (?<url>http:\/\/\S+\/mcp)/u;
const ORIGINAL_ARGV = process.argv;

describe("index --http end to end", () => {
	afterEach(() => {
		process.argv = ORIGINAL_ARGV;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("serves MCP end to end and shuts down on SIGTERM", async () => {
		process.argv = ["node", "dist/index.js", "--http"];
		vi.stubEnv("MCP_HOST", "");
		vi.stubEnv("MCP_PORT", "0");
		vi.stubEnv("PORT", "");
		vi.stubEnv("MCP_AUTH_TOKEN", "t");
		const consoleError = vi
			.spyOn(console, "error")
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
			baseUrl: "https://dav.example.com",
			getCalendars: vi
				.fn()
				.mockResolvedValue([{ displayName: "Work", url: "/cal/work/" }]),
		} as unknown as Awaited<ReturnType<typeof CalDAVClient.create>>);

		await import("./index.js");
		const url = await vi.waitFor(() => {
			const line = consoleError.mock.calls
				.map(([first]) => String(first))
				.find((logged) => LISTENING.test(logged));
			const found = line?.match(LISTENING)?.groups?.url;
			if (!found) {
				throw new Error("server has not logged its URL yet");
			}
			return found;
		});
		const client = new Client({ name: "test", version: "0.0.0" });
		await client.connect(
			new StreamableHTTPClientTransport(new URL(url), {
				requestInit: { headers: { Authorization: "Bearer t" } },
			})
		);

		const { tools } = await client.listTools();
		const result = (await client.callTool({
			arguments: {},
			name: "list-calendars",
		})) as { content: { text: string }[] };
		await client.close();
		signalHandlers.get("SIGTERM")?.();

		expect(tools).toHaveLength(10);
		expect(JSON.parse(result.content[0]?.text ?? "")).toEqual([
			{ displayName: "Work", url: "https://dav.example.com/cal/work/" },
		]);
		await vi.waitFor(() => {
			expect(exit).toHaveBeenCalledWith(0);
		});
	});
});
