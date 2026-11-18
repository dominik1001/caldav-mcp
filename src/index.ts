#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { createServer } from "./server.js";

async function main() {
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

	// Start receiving messages on stdin and sending messages on stdout
	await createServer(client).connect(new StdioServerTransport());
}

main();
