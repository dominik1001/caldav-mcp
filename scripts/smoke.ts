#!/usr/bin/env tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
};

function unwrapText(result: unknown): string {
	const r = result as ToolResult;
	const first = r.content?.[0];
	if (!first || first.type !== "text") {
		throw new Error(`Unexpected tool result shape: ${JSON.stringify(result)}`);
	}
	if (r.isError) {
		throw new Error(`Tool returned error: ${first.text}`);
	}
	return first.text;
}

function log(step: string, detail?: unknown) {
	const suffix =
		detail === undefined
			? ""
			: ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
	console.log(`▶ ${step}${suffix}`);
}

async function main() {
	function requireEnv(name: string): string {
		const value = process.env[name];
		if (!value) {
			console.error(`Missing env var: ${name}`);
			process.exit(1);
		}
		return value;
	}

	const transport = new StdioClientTransport({
		command: "node",
		args: ["dist/index.js"],
		env: {
			PATH: process.env.PATH ?? "",
			CALDAV_BASE_URL: requireEnv("CALDAV_BASE_URL"),
			CALDAV_USERNAME: requireEnv("CALDAV_USERNAME"),
			CALDAV_PASSWORD: requireEnv("CALDAV_PASSWORD"),
		},
		stderr: "inherit",
	});

	const client = new Client({ name: "caldav-mcp-smoke", version: "0.0.0" });
	await client.connect(transport);
	log("connected to server");

	const { tools } = await client.listTools();
	const toolNames = tools.map((t) => t.name).sort();
	log("tools registered", toolNames);
	const expected = [
		"create-event",
		"delete-event",
		"list-calendars",
		"list-events",
		"update-event",
		"create-todo",
		"list-todos",
		"update-todo",
		"complete-todo",
		"delete-todo",
	];
	for (const name of expected) {
		if (!toolNames.includes(name)) throw new Error(`Missing tool: ${name}`);
	}

	const calendarsRaw = unwrapText(
		await client.callTool({ name: "list-calendars", arguments: {} }),
	);
	const calendars = JSON.parse(calendarsRaw) as Array<{
		displayName?: string;
		url: string;
		supportedComponents?: string[];
	}>;
	if (calendars.length === 0) throw new Error("No calendars returned");
	const calendarUrl = calendars[0].url;
	log("using calendar", calendars[0].displayName ?? calendarUrl);

	const start = new Date(Date.now() + 60 * 60 * 1000);
	const end = new Date(start.getTime() + 30 * 60 * 1000);
	const summary = `caldav-mcp smoke ${start.toISOString()}`;

	const uid = unwrapText(
		await client.callTool({
			name: "create-event",
			arguments: {
				summary,
				start: start.toISOString(),
				end: end.toISOString(),
				calendarUrl,
			},
		}),
	);
	log("created event", uid);

	const listed = JSON.parse(
		unwrapText(
			await client.callTool({
				name: "list-events",
				arguments: {
					start: new Date(start.getTime() - 60_000).toISOString(),
					end: new Date(end.getTime() + 60_000).toISOString(),
					calendarUrl,
				},
			}),
		),
	) as Array<{ uid: string; summary: string }>;
	const found = listed.find((e) => e.uid === uid);
	if (!found) throw new Error(`Created event ${uid} not found in list-events`);
	if (found.summary !== summary)
		throw new Error(`Summary mismatch: ${found.summary} !== ${summary}`);
	log("listed event", { uid: found.uid, summary: found.summary });

	const updatedSummary = `${summary} (updated)`;
	const updatedUid = unwrapText(
		await client.callTool({
			name: "update-event",
			arguments: { uid, calendarUrl, summary: updatedSummary },
		}),
	);
	log("updated event", updatedUid);

	const deleted = unwrapText(
		await client.callTool({
			name: "delete-event",
			arguments: { uid: updatedUid, calendarUrl },
		}),
	);
	log("deleted event", deleted);

	const after = JSON.parse(
		unwrapText(
			await client.callTool({
				name: "list-events",
				arguments: {
					start: new Date(start.getTime() - 60_000).toISOString(),
					end: new Date(end.getTime() + 60_000).toISOString(),
					calendarUrl,
				},
			}),
		),
	) as Array<{ uid: string }>;
	if (after.some((e) => e.uid === updatedUid))
		throw new Error(`Event ${updatedUid} still present after delete`);
	log("verified deletion");

	// End-to-end coverage for recurring events. Specific `until` → Date
	// conversion is asserted in create-event.test.ts / update-event.test.ts;
	// here we just verify the recurrence path round-trips through ts-caldav
	// against a real CalDAV server.
	const recurStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
	const recurEnd = new Date(recurStart.getTime() + 30 * 60 * 1000);
	const recurUid = unwrapText(
		await client.callTool({
			name: "create-event",
			arguments: {
				summary: `caldav-mcp smoke recur ${recurStart.toISOString()}`,
				start: recurStart.toISOString(),
				end: recurEnd.toISOString(),
				calendarUrl,
				recurrenceRule: {
					freq: "DAILY",
					count: 3,
				},
			},
		}),
	);
	log("created recurring event", recurUid);

	unwrapText(
		await client.callTool({
			name: "delete-event",
			arguments: { uid: recurUid, calendarUrl },
		}),
	);
	log("deleted recurring event");

	// VTODO round-trip: create → list → complete → update → delete on a
	// task-capable collection. Mailbox.org exposes a separate VTODO calendar;
	// if the account has none, skip rather than fail (events already verified).
	const todoCalendar = calendars.find((c) =>
		c.supportedComponents?.includes("VTODO"),
	);
	if (!todoCalendar) {
		log("no VTODO-capable calendar found, skipping todo round-trip");
	} else {
		const todoCalendarUrl = todoCalendar.url;
		log("using todo calendar", todoCalendar.displayName ?? todoCalendarUrl);

		const todoSummary = `caldav-mcp smoke todo ${new Date().toISOString()}`;
		const todoUid = unwrapText(
			await client.callTool({
				name: "create-todo",
				arguments: {
					summary: todoSummary,
					calendarUrl: todoCalendarUrl,
					due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
				},
			}),
		);
		log("created todo", todoUid);

		const listedTodos = JSON.parse(
			unwrapText(
				await client.callTool({
					name: "list-todos",
					arguments: { calendarUrl: todoCalendarUrl, status: "all" },
				}),
			),
		) as { todos: Array<{ uid: string; summary: string; status: string }> };
		const foundTodo = listedTodos.todos.find((t) => t.uid === todoUid);
		if (!foundTodo)
			throw new Error(`Created todo ${todoUid} not found in list-todos`);
		if (foundTodo.summary !== todoSummary)
			throw new Error(
				`Todo summary mismatch: ${foundTodo.summary} !== ${todoSummary}`,
			);
		log("listed todo", { uid: foundTodo.uid, status: foundTodo.status });

		unwrapText(
			await client.callTool({
				name: "complete-todo",
				arguments: { uid: todoUid, calendarUrl: todoCalendarUrl },
			}),
		);
		const completed = JSON.parse(
			unwrapText(
				await client.callTool({
					name: "list-todos",
					arguments: { calendarUrl: todoCalendarUrl, status: "completed" },
				}),
			),
		) as { todos: Array<{ uid: string; status: string }> };
		if (
			!completed.todos.some(
				(t) => t.uid === todoUid && t.status === "COMPLETED",
			)
		)
			throw new Error(`Todo ${todoUid} not COMPLETED after complete-todo`);
		log("completed todo", todoUid);

		unwrapText(
			await client.callTool({
				name: "update-todo",
				arguments: {
					uid: todoUid,
					calendarUrl: todoCalendarUrl,
					summary: `${todoSummary} (updated)`,
				},
			}),
		);
		log("updated todo", todoUid);

		unwrapText(
			await client.callTool({
				name: "delete-todo",
				arguments: { uid: todoUid, calendarUrl: todoCalendarUrl },
			}),
		);
		const afterTodos = JSON.parse(
			unwrapText(
				await client.callTool({
					name: "list-todos",
					arguments: { calendarUrl: todoCalendarUrl, status: "all" },
				}),
			),
		) as { todos: Array<{ uid: string }> };
		if (afterTodos.todos.some((t) => t.uid === todoUid))
			throw new Error(`Todo ${todoUid} still present after delete`);
		log("verified todo deletion");
	}

	await client.close();
	console.log("\n✅ smoke test passed");
}

main().catch((err) => {
	console.error("\n❌ smoke test failed:", err);
	process.exit(1);
});
