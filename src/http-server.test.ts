import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHttpServer } from "./http-server.js";
import { createServer } from "./server.js";

const TOKEN = "s3cret";
const INITIALIZE = JSON.stringify({
	id: 1,
	jsonrpc: "2.0",
	method: "initialize",
	params: {
		capabilities: {},
		clientInfo: { name: "test", version: "0.0.0" },
		protocolVersion: "2025-06-18",
	},
});
const POST_HEADERS = {
	Accept: "application/json, text/event-stream",
	"Content-Type": "application/json",
};

const caldav = {
	baseUrl: "https://dav.example.com",
	getCalendars: vi
		.fn()
		.mockResolvedValue([{ displayName: "Work", url: "/cal/work/" }]),
} as unknown as CalDAVClient;

async function start(
	authToken: string | undefined,
	factory: () => McpServer = () => createServer(caldav)
) {
	const server = await startHttpServer(
		{ authToken, host: "127.0.0.1", port: 0 },
		factory
	);
	const { port } = server.address() as AddressInfo;
	return { port, server };
}

function stop(server: Server) {
	return new Promise((resolve) => server.close(resolve));
}

async function connect(port: number, token: string | undefined = TOKEN) {
	const headers: Record<string, string> = token
		? { Authorization: `Bearer ${token}` }
		: {};
	const client = new Client({ name: "test", version: "0.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: { headers },
		})
	);
	return client;
}

/** Raw request via node:http, which (unlike fetch) lets us set Host. */
function raw(
	port: number,
	options: {
		body?: string;
		headers?: Record<string, string>;
		method?: string;
		path?: string;
	}
): Promise<{ body: string; headers: Record<string, unknown>; status: number }> {
	return new Promise((resolve, reject) => {
		const req = request(
			{
				headers: options.headers,
				host: "127.0.0.1",
				method: options.method ?? "POST",
				path: options.path ?? "/mcp",
				port,
			},
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk: string) => {
					body += chunk;
				});
				res.on("end", () =>
					resolve({ body, headers: res.headers, status: res.statusCode ?? 0 })
				);
			}
		);
		req.on("error", reject);
		req.end(options.body);
	});
}

function initialize(port: number, headers: Record<string, string> = {}) {
	return raw(port, {
		body: INITIALIZE,
		headers: {
			...POST_HEADERS,
			Authorization: `Bearer ${TOKEN}`,
			...headers,
		},
	});
}

describe("startHttpServer with a token", () => {
	let server: Server;
	let port: number;

	beforeAll(async () => {
		({ port, server } = await start(TOKEN));
	});
	afterAll(() => stop(server));

	it("lists tools and calls list-calendars over HTTP", async () => {
		const client = await connect(port);

		const { tools } = await client.listTools();
		const result = (await client.callTool({
			arguments: {},
			name: "list-calendars",
		})) as { content: { text: string }[] };

		expect(tools).toHaveLength(10);
		expect(JSON.parse(result.content[0]?.text ?? "")).toEqual([
			{ displayName: "Work", url: "https://dav.example.com/cal/work/" },
		]);
		await client.close();
	});

	it("serves two clients in sequence", async () => {
		const first = await connect(port);
		await first.listTools();
		await first.close();
		const second = await connect(port);

		const { tools } = await second.listTools();

		expect(tools).toHaveLength(10);
		await second.close();
	});

	it("serves concurrent tool calls", async () => {
		const client = await connect(port);

		const results = await Promise.all([
			client.callTool({ arguments: {}, name: "list-calendars" }),
			client.callTool({ arguments: {}, name: "list-calendars" }),
		]);

		expect(results.every((result) => !result.isError)).toBe(true);
		await client.close();
	});

	it("rejects a missing token with 401", async () => {
		const response = await raw(port, {
			body: INITIALIZE,
			headers: POST_HEADERS,
		});

		expect(response.status).toBe(401);
		expect(response.headers["www-authenticate"]).toBe("Bearer");
	});

	it("rejects a wrong token of a different length with 401", async () => {
		const response = await initialize(port, { Authorization: "Bearer x" });

		expect(response.status).toBe(401);
		expect(response.headers["www-authenticate"]).toBe("Bearer");
	});

	it("rejects a wrong token of the same length with 401", async () => {
		const response = await initialize(port, { Authorization: "Bearer s3creT" });

		expect(response.status).toBe(401);
	});

	it("accepts a lowercase bearer scheme", async () => {
		const response = await initialize(port, {
			Authorization: `bearer ${TOKEN}`,
		});

		expect(response.status).toBe(200);
	});

	it("rejects requests with an Origin header with 403", async () => {
		const response = await initialize(port, { Origin: "http://evil.example" });

		expect(response.status).toBe(403);
	});

	it("rejects a non-loopback Host with 403", async () => {
		const response = await initialize(port, { Host: "evil.example:3000" });

		expect(response.status).toBe(403);
	});

	it.each(["localhost:3000", "[::1]:3000", "127.0.0.1"])(
		"accepts the loopback Host header %s",
		async (host) => {
			const response = await initialize(port, { Host: host });

			expect(response.status).toBe(200);
		}
	);

	it.each(["GET", "DELETE"])(
		"returns 405 with Allow: POST for %s on /mcp",
		async (method) => {
			const response = await raw(port, {
				headers: { Authorization: `Bearer ${TOKEN}` },
				method,
			});

			expect(response.status).toBe(405);
			expect(response.headers.allow).toBe("POST");
		}
	);

	it.each(["/", "/mcpx"])("returns 404 for %s", async (path) => {
		const response = await raw(port, {
			body: INITIALIZE,
			headers: { ...POST_HEADERS, Authorization: `Bearer ${TOKEN}` },
			path,
		});

		expect(response.status).toBe(404);
	});

	it("serves /health without a token", async () => {
		const response = await raw(port, { method: "GET", path: "/health" });

		expect(response.status).toBe(200);
		expect(response.body).toBe("ok");
	});

	it("answers malformed JSON with 400", async () => {
		const response = await raw(port, {
			body: "{not json",
			headers: { ...POST_HEADERS, Authorization: `Bearer ${TOKEN}` },
		});

		expect(response.status).toBe(400);
	});
});

describe("startHttpServer without a token", () => {
	it("accepts requests with no Authorization header", async () => {
		const { port, server } = await start(undefined);

		const client = await connect(port, undefined);
		const { tools } = await client.listTools();

		expect(tools).toHaveLength(10);
		await client.close();
		await stop(server);
	});

	it("answers a throwing server factory with a JSON-RPC 500 and logs it", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const { port, server } = await start(undefined, () => {
			throw new Error("boom");
		});

		const response = await raw(port, {
			body: INITIALIZE,
			headers: POST_HEADERS,
		});

		expect(response.status).toBe(500);
		expect(JSON.parse(response.body)).toMatchObject({
			error: { code: -32_603 },
			id: null,
			jsonrpc: "2.0",
		});
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("request failed"),
			expect.objectContaining({ message: "boom" })
		);
		consoleError.mockRestore();
		await stop(server);
	});
});
