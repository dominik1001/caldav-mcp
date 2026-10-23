import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import {
	listCalendarsDefinition,
	registerListCalendars,
} from "./list-calendars.js";

type ToolHandler = () => Promise<{ content: { type: string; text: string }[] }>;

async function listCalendars(baseUrl: string, urls: string[]) {
	const mockClient = {
		baseUrl,
		getCalendars: vi.fn().mockResolvedValue(
			urls.map((url, i) => ({
				displayName: `Calendar ${i}`,
				url,
				supportedComponents: ["VEVENT"],
			})),
		),
	};
	let handler: ToolHandler | undefined;
	const server = {
		registerTool: (_name: string, _config: unknown, h: ToolHandler) => {
			handler = h;
		},
	};

	await registerListCalendars(
		mockClient as unknown as CalDAVClient,
		server as unknown as McpServer,
	);
	if (!handler) throw new Error("list-calendars was not registered");
	const result = await handler();
	return JSON.parse(result.content[0]?.text ?? "") as {
		displayName: string;
		url: string;
	}[];
}

describe("registerListCalendars", () => {
	test("returns absolute calendar URLs resolved against the base URL", async () => {
		const calendars = await listCalendars(
			"https://cloud.example.com/remote.php/dav",
			[
				"/remote.php/dav/calendars/user/personal/",
				"/remote.php/dav/calendars/user/work/",
			],
		);

		expect(calendars).toEqual([
			expect.objectContaining({
				displayName: "Calendar 0",
				url: "https://cloud.example.com/remote.php/dav/calendars/user/personal/",
			}),
			expect.objectContaining({
				displayName: "Calendar 1",
				url: "https://cloud.example.com/remote.php/dav/calendars/user/work/",
			}),
		]);
	});

	test("keeps calendar URLs the server already returned as absolute", async () => {
		const url = "https://cloud.example.com/calendars/user/personal/";
		const [calendar] = await listCalendars("https://cloud.example.com", [url]);

		expect(calendar?.url).toBe(url);
	});

	test("tells agents to pass the URL back verbatim", () => {
		expect(listCalendarsDefinition.description).toContain("absolute URL");
		expect(listCalendarsDefinition.description).toContain("unchanged");
	});
});
