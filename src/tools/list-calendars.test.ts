import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, it, vi } from "vitest";
import {
	listCalendarsDefinition,
	registerListCalendars,
} from "./list-calendars.js";

type ToolHandler = () => Promise<{ content: { type: string; text: string }[] }>;

function calendarsFor(urls: string[]) {
	return urls.map((url, i) => ({
		displayName: `Calendar ${i}`,
		supportedComponents: ["VEVENT"],
		url,
	}));
}

function register(baseUrl: string, urls: string[]) {
	const mockClient = {
		baseUrl,
		getCalendars: vi.fn().mockResolvedValue(calendarsFor(urls)),
	};
	let handler: ToolHandler | undefined;
	const server = {
		registerTool: (_name: string, _config: unknown, h: ToolHandler) => {
			handler = h;
		},
	};

	registerListCalendars(
		mockClient as unknown as CalDAVClient,
		server as unknown as McpServer
	);
	if (!handler) {
		throw new Error("list-calendars was not registered");
	}
	const registered = handler;
	const call = async () => {
		const result = await registered();
		return JSON.parse(result.content[0]?.text ?? "") as {
			displayName: string;
			url: string;
		}[];
	};
	return { call, mockClient };
}

function listCalendars(baseUrl: string, urls: string[]) {
	return register(baseUrl, urls).call();
}

describe("registerListCalendars", () => {
	it("returns absolute calendar URLs resolved against the base URL", async () => {
		const calendars = await listCalendars(
			"https://cloud.example.com/remote.php/dav",
			[
				"/remote.php/dav/calendars/user/personal/",
				"/remote.php/dav/calendars/user/work/",
			]
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

	it("keeps calendar URLs the server already returned as absolute", async () => {
		const url = "https://cloud.example.com/calendars/user/personal/";
		const [calendar] = await listCalendars("https://cloud.example.com", [url]);

		expect(calendar?.url).toBe(url);
	});

	it("does not contact CalDAV when the tool is registered", () => {
		const { mockClient } = register("https://cloud.example.com", ["/a/"]);

		expect(mockClient.getCalendars).not.toHaveBeenCalled();
	});

	it("fetches calendars on every call", async () => {
		const { call, mockClient } = register("https://cloud.example.com", ["/a/"]);
		await call();
		mockClient.getCalendars.mockResolvedValue(calendarsFor(["/a/", "/b/"]));

		const second = await call();

		expect(second).toHaveLength(2);
		expect(mockClient.getCalendars).toHaveBeenCalledTimes(2);
	});

	it("tells agents to pass the URL back verbatim", () => {
		expect(listCalendarsDefinition.description).toContain("absolute URL");
		expect(listCalendarsDefinition.description).toContain("unchanged");
	});
});
