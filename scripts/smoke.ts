#!/usr/bin/env tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { hrefFor } from "../src/tools/caldav-href.js";

type ToolResult = {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
};

function unwrapText(result: unknown): string {
	const r = result as ToolResult;
	const first = r.content?.[0];
	if (first?.type !== "text") {
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
			// Whole-day dates only shift east of UTC, so CI pins a zone here.
			...(process.env.TZ && { TZ: process.env.TZ }),
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

	// Whole-day dates are checked against the stored ICS: list-events does not
	// show VALUE=DATE or the RRULE, and both are where the off-by-ones hide.
	const auth = `Basic ${Buffer.from(
		`${requireEnv("CALDAV_USERNAME")}:${requireEnv("CALDAV_PASSWORD")}`,
	).toString("base64")}`;
	async function fetchIcs(eventUid: string): Promise<string> {
		const url = new URL(
			hrefFor(calendarUrl, eventUid),
			requireEnv("CALDAV_BASE_URL"),
		);
		const res = await fetch(url, { headers: { Authorization: auth } });
		if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
		return res.text();
	}
	function expectIcsProp(ics: string, name: string, expected: string) {
		const actual = ics.match(new RegExp(`^${name}[;:](.*)$`, "m"))?.[1]?.trim();
		if (actual !== expected)
			throw new Error(`${name} mismatch: ${actual} !== ${expected}\n${ics}`);
	}

	const convertUid = unwrapText(
		await client.callTool({
			name: "create-event",
			arguments: {
				summary: "caldav-mcp smoke timed to whole-day",
				start: "2030-08-18T10:00:00Z",
				end: "2030-08-18T11:00:00Z",
				calendarUrl,
			},
		}),
	);
	try {
		unwrapText(
			await client.callTool({
				name: "update-event",
				arguments: { uid: convertUid, calendarUrl, wholeDay: true },
			}),
		);
		const ics = await fetchIcs(convertUid);
		expectIcsProp(ics, "DTSTART", "VALUE=DATE:20300818");
		expectIcsProp(ics, "DTEND", "VALUE=DATE:20300819");
		log("converted timed event to a one-day whole-day event");
	} finally {
		await client.callTool({
			name: "delete-event",
			arguments: { uid: convertUid, calendarUrl },
		});
	}

	// Whole-day round trip with a date written east of UTC (+09:00), then an
	// update that changes only the location. Regression test for whole-day
	// dates shifting a day earlier: on create, when the offset input was
	// converted by instant; on update, when the stored dates were carried over
	// as is. See src/tools/whole-day-date.ts.
	const offsetWholeDayDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
	const offsetWholeDayIso = `${offsetWholeDayDate}T00:00:00+09:00`;
	const offsetWholeDayNextDate = new Date(`${offsetWholeDayDate}T00:00:00Z`);
	offsetWholeDayNextDate.setUTCDate(offsetWholeDayNextDate.getUTCDate() + 1);
	const offsetWholeDayDtstart = `VALUE=DATE:${offsetWholeDayDate.replaceAll("-", "")}`;
	const offsetWholeDayDtend = `VALUE=DATE:${offsetWholeDayNextDate
		.toISOString()
		.slice(0, 10)
		.replaceAll("-", "")}`;
	// A yearly rule ending four years on (a leap day stays valid), so UNTIL is
	// checked too: ts-caldav reads and writes it the same way as DTSTART.
	const offsetWholeDayUntil = `${Number(offsetWholeDayDate.slice(0, 4)) + 4}${offsetWholeDayDate.slice(4)}`;
	const offsetWholeDayUntilIcs = `UNTIL=${offsetWholeDayUntil.replaceAll("-", "")}`;
	// Until #100 lands, list-events returns a whole-day start as the instant of
	// local midnight; read it back as a local calendar date so the check holds
	// in any TZ (the server is spawned with this process's TZ). A bare date is
	// taken as is.
	function listedCalendarDate(value: string): string {
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
		const d = new Date(value);
		return [
			d.getFullYear(),
			String(d.getMonth() + 1).padStart(2, "0"),
			String(d.getDate()).padStart(2, "0"),
		].join("-");
	}
	async function listOffsetWholeDay(eventUid: string) {
		const windowStart = new Date(`${offsetWholeDayDate}T00:00:00Z`);
		windowStart.setUTCDate(windowStart.getUTCDate() - 1);
		const windowEnd = new Date(`${offsetWholeDayDate}T00:00:00Z`);
		windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);
		const listed = JSON.parse(
			unwrapText(
				await client.callTool({
					name: "list-events",
					arguments: {
						start: windowStart.toISOString(),
						end: windowEnd.toISOString(),
						calendarUrl,
					},
				}),
			),
		) as Array<{ uid: string; start: string; location?: string }>;
		const found = listed.find((e) => e.uid === eventUid);
		if (!found) throw new Error(`Whole-day event ${eventUid} not found`);
		return found;
	}
	function expectOffsetWholeDayDates(ics: string, stage: string) {
		try {
			expectIcsProp(ics, "DTSTART", offsetWholeDayDtstart);
			expectIcsProp(ics, "DTEND", offsetWholeDayDtend);
			const rrule = ics.match(/^RRULE:(.*)$/m)?.[1]?.trim() ?? "";
			if (!rrule.split(";").includes(offsetWholeDayUntilIcs))
				throw new Error(
					`RRULE mismatch: ${rrule} lacks ${offsetWholeDayUntilIcs}\n${ics}`,
				);
		} catch (err) {
			throw new Error(
				`Whole-day dates moved ${stage} (input ${offsetWholeDayIso}): ${(err as Error).message}`,
			);
		}
	}

	const offsetWholeDayUid = unwrapText(
		await client.callTool({
			name: "create-event",
			arguments: {
				summary: `caldav-mcp smoke whole-day ${offsetWholeDayDate}`,
				start: offsetWholeDayIso,
				end: offsetWholeDayIso,
				wholeDay: true,
				recurrenceRule: {
					freq: "YEARLY",
					until: `${offsetWholeDayUntil}T00:00:00+09:00`,
				},
				calendarUrl,
			},
		}),
	);
	log("created whole-day event", {
		uid: offsetWholeDayUid,
		input: offsetWholeDayIso,
	});
	try {
		const offsetWholeDayListed = await listOffsetWholeDay(offsetWholeDayUid);
		const offsetWholeDayListedDate = listedCalendarDate(
			offsetWholeDayListed.start,
		);
		if (offsetWholeDayListedDate !== offsetWholeDayDate) {
			throw new Error(
				`Whole-day event date shifted on create: expected ${offsetWholeDayDate}, got ${offsetWholeDayListedDate} (input ${offsetWholeDayIso})`,
			);
		}
		expectOffsetWholeDayDates(await fetchIcs(offsetWholeDayUid), "on create");
		log("verified whole-day event date", offsetWholeDayListedDate);

		const offsetWholeDayLocation = "caldav-mcp smoke location";
		unwrapText(
			await client.callTool({
				name: "update-event",
				arguments: {
					uid: offsetWholeDayUid,
					calendarUrl,
					location: offsetWholeDayLocation,
				},
			}),
		);
		const offsetWholeDayUpdated = await listOffsetWholeDay(offsetWholeDayUid);
		if (offsetWholeDayUpdated.location !== offsetWholeDayLocation)
			throw new Error(
				`Location not updated: ${offsetWholeDayUpdated.location} !== ${offsetWholeDayLocation}`,
			);
		const offsetWholeDayUpdatedDate = listedCalendarDate(
			offsetWholeDayUpdated.start,
		);
		if (offsetWholeDayUpdatedDate !== offsetWholeDayDate) {
			throw new Error(
				`Whole-day event date shifted on a location-only update: expected ${offsetWholeDayDate}, got ${offsetWholeDayUpdatedDate}`,
			);
		}
		expectOffsetWholeDayDates(
			await fetchIcs(offsetWholeDayUid),
			"on a location-only update",
		);
		log("verified whole-day dates after a location-only update");
	} finally {
		await client.callTool({
			name: "delete-event",
			arguments: { uid: offsetWholeDayUid, calendarUrl },
		});
		log("deleted whole-day event");
	}

	// VTODO round-trip: create → list → complete → update → delete on a
	// task-capable collection. Tasks often live in a separate VTODO calendar;
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
					arguments: { calendarUrl: todoCalendarUrl, status: "ALL" },
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
					arguments: { calendarUrl: todoCalendarUrl, status: "COMPLETED" },
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
					arguments: { calendarUrl: todoCalendarUrl, status: "ALL" },
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
