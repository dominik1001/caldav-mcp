#!/usr/bin/env tsx
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { hrefFor } from "../src/tools/caldav-href.js";

const ABSOLUTE_URL = /^https?:\/\//;
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RRULE_LINE = /^RRULE:(.*)$/m;
const RRULE_UNTIL = /(?:^|;)UNTIL=([^;]*)/;

interface ListedCalendar {
	displayName?: string;
	supportedComponents?: string[];
	url: string;
}

interface ToolResult {
	content?: Array<{ type: string; text: string }>;
	isError?: boolean;
}

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

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing env var: ${name}`);
		process.exit(1);
	}
	return value;
}

function expectIcsProp(ics: string, name: string, expectedValue: string) {
	const actual = ics.match(new RegExp(`^${name}[;:](.*)$`, "m"))?.[1]?.trim();
	if (actual !== expectedValue) {
		throw new Error(`${name} mismatch: ${actual} !== ${expectedValue}\n${ics}`);
	}
}

// Until #100 lands, list-events returns a whole-day start as the instant of
// local midnight; read it back as a local calendar date so the check holds
// in any TZ (the server is spawned with this process's TZ). A bare date is
// taken as is.
function listedCalendarDate(value: string): string {
	if (BARE_DATE.test(value)) {
		return value;
	}
	const d = new Date(value);
	return [
		d.getFullYear(),
		String(d.getMonth() + 1).padStart(2, "0"),
		String(d.getDate()).padStart(2, "0"),
	].join("-");
}

async function smokeWholeDayEvents(client: Client, calendarUrl: string) {
	// Whole-day dates are checked against the stored ICS: list-events does not
	// show VALUE=DATE or the RRULE, and both are where the off-by-ones hide.
	const auth = `Basic ${Buffer.from(
		`${requireEnv("CALDAV_USERNAME")}:${requireEnv("CALDAV_PASSWORD")}`
	).toString("base64")}`;
	async function fetchIcs(eventUid: string): Promise<string> {
		const url = new URL(
			hrefFor(calendarUrl, eventUid),
			requireEnv("CALDAV_BASE_URL")
		);
		const res = await fetch(url, { headers: { Authorization: auth } });
		if (!res.ok) {
			throw new Error(`GET ${url} failed: ${res.status}`);
		}
		return res.text();
	}

	const convertUid = unwrapText(
		await client.callTool({
			arguments: {
				calendarUrl,
				end: "2030-08-18T11:00:00Z",
				start: "2030-08-18T10:00:00Z",
				summary: "caldav-mcp smoke timed to whole-day",
			},
			name: "create-event",
		})
	);
	try {
		unwrapText(
			await client.callTool({
				arguments: { calendarUrl, uid: convertUid, wholeDay: true },
				name: "update-event",
			})
		);
		const ics = await fetchIcs(convertUid);
		expectIcsProp(ics, "DTSTART", "VALUE=DATE:20300818");
		expectIcsProp(ics, "DTEND", "VALUE=DATE:20300819");
		log("converted timed event to a one-day whole-day event");
	} finally {
		await client.callTool({
			arguments: { calendarUrl, uid: convertUid },
			name: "delete-event",
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
	// A yearly rule ending four years on (a leap day stays valid), so the UNTIL
	// that create-event writes is checked too.
	const offsetWholeDayUntil = `${Number(offsetWholeDayDate.slice(0, 4)) + 4}${offsetWholeDayDate.slice(4)}`;
	async function listOffsetWholeDay(eventUid: string) {
		const windowStart = new Date(`${offsetWholeDayDate}T00:00:00Z`);
		windowStart.setUTCDate(windowStart.getUTCDate() - 1);
		const windowEnd = new Date(`${offsetWholeDayDate}T00:00:00Z`);
		windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);
		const windowEvents = JSON.parse(
			unwrapText(
				await client.callTool({
					arguments: {
						calendarUrl,
						end: windowEnd.toISOString(),
						start: windowStart.toISOString(),
					},
					name: "list-events",
				})
			)
		) as Array<{ uid: string; start: string; location?: string }>;
		const event = windowEvents.find((e) => e.uid === eventUid);
		if (!event) {
			throw new Error(`Whole-day event ${eventUid} not found`);
		}
		return event;
	}
	function expectOffsetWholeDayDates(
		ics: string,
		stage: string,
		checkUntil: boolean
	) {
		try {
			expectIcsProp(ics, "DTSTART", offsetWholeDayDtstart);
			expectIcsProp(ics, "DTEND", offsetWholeDayDtend);
			if (!checkUntil) {
				return;
			}
			// ts-caldav writes a whole-day UNTIL in extended form (2030-10-26),
			// so compare the calendar day, not the spelling.
			const rrule = ics.match(RRULE_LINE)?.[1]?.trim() ?? "";
			const until = rrule.match(RRULE_UNTIL)?.[1] ?? "";
			if (
				until.replaceAll("-", "") !== offsetWholeDayUntil.replaceAll("-", "")
			) {
				throw new Error(
					`RRULE UNTIL mismatch: ${until} !== ${offsetWholeDayUntil}\n${ics}`
				);
			}
		} catch (err) {
			throw new Error(
				`Whole-day dates moved ${stage} (input ${offsetWholeDayIso}): ${(err as Error).message}`,
				{ cause: err }
			);
		}
	}

	const offsetWholeDayUid = unwrapText(
		await client.callTool({
			arguments: {
				calendarUrl,
				end: offsetWholeDayIso,
				recurrenceRule: {
					freq: "YEARLY",
					until: `${offsetWholeDayUntil}T00:00:00+09:00`,
				},
				start: offsetWholeDayIso,
				summary: `caldav-mcp smoke whole-day ${offsetWholeDayDate}`,
				wholeDay: true,
			},
			name: "create-event",
		})
	);
	log("created whole-day event", {
		input: offsetWholeDayIso,
		uid: offsetWholeDayUid,
	});
	try {
		const offsetWholeDayListed = await listOffsetWholeDay(offsetWholeDayUid);
		const offsetWholeDayListedDate = listedCalendarDate(
			offsetWholeDayListed.start
		);
		if (offsetWholeDayListedDate !== offsetWholeDayDate) {
			throw new Error(
				`Whole-day event date shifted on create: expected ${offsetWholeDayDate}, got ${offsetWholeDayListedDate} (input ${offsetWholeDayIso})`
			);
		}
		expectOffsetWholeDayDates(
			await fetchIcs(offsetWholeDayUid),
			"on create",
			true
		);
		log("verified whole-day event date", offsetWholeDayListedDate);

		const offsetWholeDayLocation = "caldav-mcp smoke location";
		unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl,
					location: offsetWholeDayLocation,
					uid: offsetWholeDayUid,
				},
				name: "update-event",
			})
		);
		const offsetWholeDayUpdated = await listOffsetWholeDay(offsetWholeDayUid);
		if (offsetWholeDayUpdated.location !== offsetWholeDayLocation) {
			throw new Error(
				`Location not updated: ${offsetWholeDayUpdated.location} !== ${offsetWholeDayLocation}`
			);
		}
		const offsetWholeDayUpdatedDate = listedCalendarDate(
			offsetWholeDayUpdated.start
		);
		if (offsetWholeDayUpdatedDate !== offsetWholeDayDate) {
			throw new Error(
				`Whole-day event date shifted on a location-only update: expected ${offsetWholeDayDate}, got ${offsetWholeDayUpdatedDate}`
			);
		}
		expectOffsetWholeDayDates(
			await fetchIcs(offsetWholeDayUid),
			"on a location-only update",
			// Not UNTIL: ts-caldav 0.4.4 reads its own extended-form UNTIL
			// (2030-10-26) back wrong (ical.js parses it as 2029-10-31), so an
			// update that carries the rule over can't keep it, with or without
			// this conversion. That needs fixing in ts-caldav's writer.
			false
		);
		log("verified whole-day dates after a location-only update");
	} finally {
		await client.callTool({
			arguments: { calendarUrl, uid: offsetWholeDayUid },
			name: "delete-event",
		});
		log("deleted whole-day event");
	}
}

async function smokeTodos(client: Client, calendars: ListedCalendar[]) {
	// VTODO round-trip: create → list → complete → update → delete on a
	// task-capable collection. Tasks often live in a separate VTODO calendar;
	// if the account has none, skip rather than fail (events already verified).
	const todoCalendar = calendars.find((c) =>
		c.supportedComponents?.includes("VTODO")
	);
	if (todoCalendar) {
		const todoCalendarUrl = todoCalendar.url;
		log("using todo calendar", todoCalendar.displayName ?? todoCalendarUrl);

		const todoSummary = `caldav-mcp smoke todo ${new Date().toISOString()}`;
		const todoUid = unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl: todoCalendarUrl,
					due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
					summary: todoSummary,
				},
				name: "create-todo",
			})
		);
		log("created todo", todoUid);

		const listedTodos = JSON.parse(
			unwrapText(
				await client.callTool({
					arguments: { calendarUrl: todoCalendarUrl, status: "ALL" },
					name: "list-todos",
				})
			)
		) as { todos: Array<{ uid: string; summary: string; status: string }> };
		const foundTodo = listedTodos.todos.find((t) => t.uid === todoUid);
		if (!foundTodo) {
			throw new Error(`Created todo ${todoUid} not found in list-todos`);
		}
		if (foundTodo.summary !== todoSummary) {
			throw new Error(
				`Todo summary mismatch: ${foundTodo.summary} !== ${todoSummary}`
			);
		}
		log("listed todo", { status: foundTodo.status, uid: foundTodo.uid });

		unwrapText(
			await client.callTool({
				arguments: { calendarUrl: todoCalendarUrl, uid: todoUid },
				name: "complete-todo",
			})
		);
		const completed = JSON.parse(
			unwrapText(
				await client.callTool({
					arguments: { calendarUrl: todoCalendarUrl, status: "COMPLETED" },
					name: "list-todos",
				})
			)
		) as { todos: Array<{ uid: string; status: string }> };
		if (
			!completed.todos.some(
				(t) => t.uid === todoUid && t.status === "COMPLETED"
			)
		) {
			throw new Error(`Todo ${todoUid} not COMPLETED after complete-todo`);
		}
		log("completed todo", todoUid);

		unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl: todoCalendarUrl,
					summary: `${todoSummary} (updated)`,
					uid: todoUid,
				},
				name: "update-todo",
			})
		);
		log("updated todo", todoUid);

		unwrapText(
			await client.callTool({
				arguments: { calendarUrl: todoCalendarUrl, uid: todoUid },
				name: "delete-todo",
			})
		);
		const afterTodos = JSON.parse(
			unwrapText(
				await client.callTool({
					arguments: { calendarUrl: todoCalendarUrl, status: "ALL" },
					name: "list-todos",
				})
			)
		) as { todos: Array<{ uid: string }> };
		if (afterTodos.todos.some((t) => t.uid === todoUid)) {
			throw new Error(`Todo ${todoUid} still present after delete`);
		}
		log("verified todo deletion");
	} else {
		log("no VTODO-capable calendar found, skipping todo round-trip");
	}
}

async function main() {
	const transport = new StdioClientTransport({
		args: ["dist/index.js"],
		command: "node",
		env: {
			CALDAV_BASE_URL: requireEnv("CALDAV_BASE_URL"),
			CALDAV_PASSWORD: requireEnv("CALDAV_PASSWORD"),
			CALDAV_USERNAME: requireEnv("CALDAV_USERNAME"),
			PATH: process.env.PATH ?? "",
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
	const expectedTools = [
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
	for (const name of expectedTools) {
		if (!toolNames.includes(name)) {
			throw new Error(`Missing tool: ${name}`);
		}
	}

	const calendarsRaw = unwrapText(
		await client.callTool({ arguments: {}, name: "list-calendars" })
	);
	const calendars = JSON.parse(calendarsRaw) as ListedCalendar[];
	if (calendars.length === 0) {
		throw new Error("No calendars returned");
	}
	const calendarUrl = calendars[0].url;
	log("using calendar", calendars[0].displayName ?? calendarUrl);

	// Agents pass this URL back verbatim, so it must be absolute (#81). The
	// round-trips below therefore run on the absolute form. The origin may
	// differ from CALDAV_BASE_URL when the calendar home lives on another host.
	if (!ABSOLUTE_URL.test(calendarUrl)) {
		throw new Error(
			`list-calendars returned ${calendarUrl}, expected an absolute URL`
		);
	}
	const calendarPath = new URL(calendarUrl).pathname;

	const start = new Date(Date.now() + 60 * 60 * 1000);
	const end = new Date(start.getTime() + 30 * 60 * 1000);
	const summary = `caldav-mcp smoke ${start.toISOString()}`;

	const uid = unwrapText(
		await client.callTool({
			arguments: {
				calendarUrl,
				end: end.toISOString(),
				start: start.toISOString(),
				summary,
			},
			name: "create-event",
		})
	);
	log("created event", uid);

	const listed = JSON.parse(
		unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl,
					end: new Date(end.getTime() + 60_000).toISOString(),
					start: new Date(start.getTime() - 60_000).toISOString(),
				},
				name: "list-events",
			})
		)
	) as Array<{ uid: string; summary: string }>;
	const found = listed.find((e) => e.uid === uid);
	if (!found) {
		throw new Error(`Created event ${uid} not found in list-events`);
	}
	if (found.summary !== summary) {
		throw new Error(`Summary mismatch: ${found.summary} !== ${summary}`);
	}
	log("listed event", { summary: found.summary, uid: found.uid });

	const updatedSummary = `${summary} (updated)`;
	const updatedUid = unwrapText(
		await client.callTool({
			arguments: { calendarUrl, summary: updatedSummary, uid },
			name: "update-event",
		})
	);
	log("updated event", updatedUid);

	const deleted = unwrapText(
		await client.callTool({
			arguments: { calendarUrl, uid: updatedUid },
			name: "delete-event",
		})
	);
	log("deleted event", deleted);

	const after = JSON.parse(
		unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl,
					end: new Date(end.getTime() + 60_000).toISOString(),
					start: new Date(start.getTime() - 60_000).toISOString(),
				},
				name: "list-events",
			})
		)
	) as Array<{ uid: string }>;
	if (after.some((e) => e.uid === updatedUid)) {
		throw new Error(`Event ${updatedUid} still present after delete`);
	}
	log("verified deletion");

	// Callers holding a server-relative path from before #81 must keep working.
	// update-event goes through calendar-multiget, where the href form matters.
	// A path only addresses the calendar on CALDAV_BASE_URL's origin, so skip
	// this when the calendar lives on another host.
	if (
		new URL(calendarUrl).origin ===
		new URL(requireEnv("CALDAV_BASE_URL")).origin
	) {
		const relativeUid = unwrapText(
			await client.callTool({
				arguments: {
					calendarUrl: calendarPath,
					end: end.toISOString(),
					start: start.toISOString(),
					summary: `${summary} (relative path)`,
				},
				name: "create-event",
			})
		);
		try {
			unwrapText(
				await client.callTool({
					arguments: {
						calendarUrl: calendarPath,
						summary: `${summary} (relative path, updated)`,
						uid: relativeUid,
					},
					name: "update-event",
				})
			);
		} finally {
			unwrapText(
				await client.callTool({
					arguments: { calendarUrl: calendarPath, uid: relativeUid },
					name: "delete-event",
				})
			);
		}
		log("round-tripped event via server-relative path", calendarPath);
	} else {
		log("calendar is on another origin, skipping relative-path round-trip");
	}

	// End-to-end coverage for recurring events. Specific `until` → Date
	// conversion is asserted in create-event.test.ts / update-event.test.ts;
	// here we just verify the recurrence path round-trips through ts-caldav
	// against a real CalDAV server.
	const recurStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
	const recurEnd = new Date(recurStart.getTime() + 30 * 60 * 1000);
	const recurUid = unwrapText(
		await client.callTool({
			arguments: {
				calendarUrl,
				end: recurEnd.toISOString(),
				recurrenceRule: {
					count: 3,
					freq: "DAILY",
				},
				start: recurStart.toISOString(),
				summary: `caldav-mcp smoke recur ${recurStart.toISOString()}`,
			},
			name: "create-event",
		})
	);
	log("created recurring event", recurUid);

	unwrapText(
		await client.callTool({
			arguments: { calendarUrl, uid: recurUid },
			name: "delete-event",
		})
	);
	log("deleted recurring event");

	await smokeWholeDayEvents(client, calendarUrl);
	await smokeTodos(client, calendars);

	await client.close();
	console.log("\n✅ smoke test passed");
}

main().catch((err) => {
	console.error("\n❌ smoke test failed:", err);
	process.exit(1);
});
