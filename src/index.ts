#!/usr/bin/env node

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { type HttpConfig, parseHttpConfig } from "./http-config.js";
import { startHttpServer } from "./http-server.js";
import { createServer } from "./server.js";

function listeningUrl(server: Server): string {
	const { address, family, port } = server.address() as AddressInfo;
	const host = family === "IPv6" ? `[${address}]` : address;
	return `http://${host}:${port}/mcp`;
}

function shutDownOnSignals(server: Server) {
	const shutdown = () => {
		server.close(() => process.exit(0));
		server.closeIdleConnections();
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

main();
