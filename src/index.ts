#!/usr/bin/env node

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { type HttpConfig, parseHttpConfig } from "./http-config.js";
import { createServer } from "./server.js";

function listeningUrl(server: Server): string {
	const { address, family, port } = server.address() as AddressInfo;
	const host = family === "IPv6" ? `[${address}]` : address;
	return `http://${host}:${port}/mcp`;
}

function shutDownOnSignals(server: Server) {
	const shutdown = () => {
		server.close(() => process.exit(0));
		// closeIdleConnections only exists from Node 18.2; engines allows 18.0.
		server.closeIdleConnections?.();
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

async function main() {
	let httpConfig: HttpConfig | undefined;
	if (process.argv.includes("--http")) {
		try {
			httpConfig = parseHttpConfig(process.env);
		} catch (error) {
			console.error((error as Error).message);
			process.exit(1);
			return;
		}
	}

	const client = await CalDAVClient.create({
		auth: {
			password: process.env.CALDAV_PASSWORD || "",
			type: "basic",
			username: process.env.CALDAV_USERNAME || "",
		},
		baseUrl: process.env.CALDAV_BASE_URL || "",
	});

	// Test connection on startup
	try {
		await client.getCalendars();
	} catch (error) {
		console.error("❌ Failed to connect to CalDAV server:", error);
		process.exit(1);
	}

	if (httpConfig) {
		// Imported lazily so stdio mode never loads the HTTP stack.
		const { startHttpServer } = await import("./http-server.js");
		const server = await startHttpServer(httpConfig, () =>
			createServer(client)
		);
		// stdout is not reserved in HTTP mode, but keep logs on stderr like stdio.
		console.error(`caldav-mcp listening on ${listeningUrl(server)}`);
		shutDownOnSignals(server);
		return;
	}

	// Start receiving messages on stdin and sending messages on stdout
	await createServer(client).connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
	// e.g. EADDRINUSE: one readable line instead of an unhandled rejection.
	const message = error instanceof Error ? error.message : String(error);
	console.error(`caldav-mcp: failed to start: ${message}`);
	process.exit(1);
});
