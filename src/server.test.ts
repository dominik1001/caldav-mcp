import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
	it("registers all tools", async () => {
		const client = {
			baseUrl: "https://dav.example.com",
			getCalendars: vi.fn().mockResolvedValue([]),
		} as unknown as CalDAVClient;
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await createServer(client).connect(serverTransport);
		const mcpClient = new Client({ name: "test", version: "0.0.0" });
		await mcpClient.connect(clientTransport);

		const { tools } = await mcpClient.listTools();

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			"complete-todo",
			"create-event",
			"create-todo",
			"delete-event",
			"delete-todo",
			"list-calendars",
			"list-events",
			"list-todos",
			"update-event",
			"update-todo",
		]);
		await mcpClient.close();
	});
});
