#!/usr/bin/env node

import { createServer, type IncomingMessage } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CalDAVClient } from "ts-caldav";

import { registerCreateEvent } from "./tools/create-event.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";
import { registerUpdateEvent } from "./tools/update-event.js";

const server = new McpServer({
	name: "caldav-mcp",
	version: "0.1.0",
});

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(chunk as Buffer);
	}
	if (chunks.length === 0) return undefined;
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

	// Test connection on startup
	try {
		await client.getCalendars();
	} catch (error) {
		console.error("❌ Failed to connect to CalDAV server:", error);
		process.exit(1);
	}

	registerCreateEvent(client, server);
	registerListEvents(client, server);
	registerDeleteEvent(client, server);
	registerUpdateEvent(client, server);
	await registerListCalendars(client, server);

	if (process.argv.includes("--http")) {
		const host = process.env.LISTEN_ADDR || "localhost";
		const port = Number.parseInt(process.env.PORT || "3000", 10);

		const httpServer = createServer(async (req, res) => {
			const url = new URL(
				req.url || "/",
				`http://${req.headers.host || "localhost"}`,
			);

			if (req.method !== "POST" || url.pathname !== "/mcp") {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "not found" }));
				return;
			}

			try {
				const body = await readJsonBody(req);
				// Stateless mode: sessionIdGenerator omitted (per SDK docs)
				// enableJsonResponse=true returns a single JSON response instead of SSE,
				// which matches the request/response shape for one-shot tool calls.
				const transport = new StreamableHTTPServerTransport({
					enableJsonResponse: true,
				});
				res.on("close", () => {
					transport.close();
				});
				// Cast works around SDK type drift under exactOptionalPropertyTypes:
				// the transport class's onclose getter is `(() => void) | undefined`
				// while the Transport interface declares `onclose?: () => void`.
				await server.connect(
					transport as unknown as Parameters<typeof server.connect>[0],
				);
				await transport.handleRequest(req, res, body);
			} catch (error) {
				console.error("MCP request failed:", error);
				if (!res.headersSent) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "internal error" }));
				}
			}
		});

		httpServer.listen(port, host, () => {
			console.error(`MCP server listening on http://${host}:${port}/mcp`);
		});
		return;
	}

	// Start receiving messages on stdin and sending messages on stdout
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
