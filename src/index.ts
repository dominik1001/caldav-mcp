#!/usr/bin/env node

import { timingSafeEqual } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CalDAVClient } from "ts-caldav";

import { registerCreateEvent } from "./tools/create-event.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";
import { registerUpdateEvent } from "./tools/update-event.js";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(chunk as Buffer);
	}
	if (chunks.length === 0) return undefined;
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Constant-time bearer-token check so request latency doesn't leak how many
// leading bytes of the configured key matched.
function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) return false;
	const provided = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(apiKey);
	if (provided.length !== expected.length) return false;
	return timingSafeEqual(provided, expected);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(payload));
}

async function main() {
	const client = await CalDAVClient.create({
		baseUrl: process.env.CALDAV_BASE_URL || "",
		auth: {
			type: "basic",
			username: process.env.CALDAV_USERNAME || "",
			password: process.env.CALDAV_PASSWORD || "",
		},
	});

	// Test connection on startup; reuse the result as the list-calendars snapshot
	// so the per-request HTTP factory below doesn't re-hit CalDAV every call.
	let calendars: Awaited<ReturnType<CalDAVClient["getCalendars"]>>;
	try {
		calendars = await client.getCalendars();
	} catch (error) {
		console.error("❌ Failed to connect to CalDAV server:", error);
		process.exit(1);
		return;
	}

	// Each transport (stdio or HTTP) needs its own McpServer: the SDK's Protocol
	// layer holds a single active transport, so a shared server can't safely back
	// concurrent stateless HTTP requests. Build a fresh one per connection.
	async function buildServer(): Promise<McpServer> {
		const server = new McpServer({
			name: "caldav-mcp",
			version: "0.1.0",
		});
		registerCreateEvent(client, server);
		registerListEvents(client, server);
		registerDeleteEvent(client, server);
		registerUpdateEvent(client, server);
		await registerListCalendars(client, server, calendars);
		return server;
	}

	if (process.argv.includes("--http")) {
		const host = process.env.LISTEN_ADDR || "localhost";
		const port = Number.parseInt(process.env.PORT || "3000", 10);
		const apiKey = process.env.MCP_API_KEY;

		if (!apiKey) {
			console.error(
				"⚠️  MCP_API_KEY is not set — the HTTP endpoint is unauthenticated. " +
					"Anyone who can reach it gets full calendar access. " +
					"Set MCP_API_KEY to require an Authorization: Bearer <token> header.",
			);
		}

		const httpServer = createServer(async (req, res) => {
			const url = new URL(
				req.url || "/",
				`http://${req.headers.host || "localhost"}`,
			);

			// Only /mcp is a valid endpoint. Any HTTP method is routed through the
			// SDK transport so it returns the spec-correct status (e.g. 405 for an
			// unsupported method) rather than a blanket 404.
			if (url.pathname !== "/mcp") {
				sendJson(res, 404, { error: "not found" });
				return;
			}

			if (apiKey && !isAuthorized(req, apiKey)) {
				res.setHeader("WWW-Authenticate", "Bearer");
				sendJson(res, 401, { error: "unauthorized" });
				return;
			}

			try {
				const body =
					req.method === "POST" ? await readJsonBody(req) : undefined;
				// Stateless mode: sessionIdGenerator omitted (per SDK docs).
				// enableJsonResponse=true returns a single JSON response instead of
				// SSE, matching the request/response shape for one-shot tool calls.
				const transport = new StreamableHTTPServerTransport({
					enableJsonResponse: true,
				});
				const server = await buildServer();
				res.on("close", () => {
					transport.close();
					server.close();
				});
				// TODO(@modelcontextprotocol/sdk@1.29.0): drop this cast once the SDK
				// types line up under exactOptionalPropertyTypes. The transport class
				// exposes `onclose: (() => void) | undefined` while the Transport
				// interface declares `onclose?: () => void`, so the structural types
				// don't match. Tracked upstream:
				// https://github.com/modelcontextprotocol/typescript-sdk/issues
				await server.connect(
					transport as unknown as Parameters<typeof server.connect>[0],
				);
				await transport.handleRequest(req, res, body);
			} catch (error) {
				console.error("MCP request failed:", error);
				if (!res.headersSent) {
					sendJson(res, 500, { error: "internal error" });
				}
			}
		});

		const shutdown = () => {
			httpServer.close(() => process.exit(0));
		};
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

		httpServer.listen(port, host, () => {
			console.error(`MCP server listening on http://${host}:${port}/mcp`);
		});
		return;
	}

	// Start receiving messages on stdin and sending messages on stdout
	const server = await buildServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
