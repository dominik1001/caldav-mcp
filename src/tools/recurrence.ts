import ICAL from "ical.js";
import type { Event, RecurrenceRule } from "ts-caldav";

/**
 * Client side expansion of recurring events.
 *
 * `getEvents` can ask the server to expand a series (RFC 4791 `<C:expand>`),
 * but a server is free to ignore that, and several do — Open-Xchange, and so
 * mailbox.org, returns the series master with its RRULE untouched. Callers
 * then see the original DTSTART of the series instead of the occurrences that
 * fall inside the requested window, which is worse than useless: a query for
 * next week answers with a date from two years ago.
 *
 * Expanding here keeps the tool honest whatever the server does.
 */

/**
 * Stops a rule that never terminates. High enough that a daily series running
 * since the 1980s still reaches a present-day window, because the walk to get
 * there costs almost nothing: only occurrences near the window are converted
 * into instants.
 */
const MAX_STEPS = 100_000;

/** How far outside the window an occurrence may look before it is discarded. */
const WALL_CLOCK_MARGIN_DAYS = 1;

function pad(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}

/** ical.js numbers the weekdays from Sunday; ts-caldav passes that number on. */
const WEEKDAY_BY_NUMBER = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * ts-caldav stringifies `wkst` straight off ical.js, so it arrives as "2"
 * rather than "MO". Feeding that back into an RRULE makes ical.js reject the
 * rule, which would drop the series entirely.
 */
function toWeekday(wkst: string): string | undefined {
	const trimmed = wkst.trim().toUpperCase();
	if (WEEKDAY_BY_NUMBER.includes(trimmed)) return trimmed;
	const numeric = Number(trimmed);
	return Number.isInteger(numeric) ? WEEKDAY_BY_NUMBER[numeric - 1] : undefined;
}

/** Rebuilds an RFC 5545 RRULE from the structure ts-caldav parses for us. */
export function toRRuleString(rule: RecurrenceRule): string {
	const parts: string[] = [];
	if (rule.freq) parts.push(`FREQ=${rule.freq}`);
	if (rule.interval && rule.interval > 1)
		parts.push(`INTERVAL=${rule.interval}`);
	if (rule.count) parts.push(`COUNT=${rule.count}`);
	if (rule.until) {
		const u = rule.until;
		parts.push(
			`UNTIL=${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`,
		);
	}
	const wkst = rule.wkst ? toWeekday(rule.wkst) : undefined;
	if (wkst) parts.push(`WKST=${wkst}`);
	if (rule.byday?.length) parts.push(`BYDAY=${rule.byday.join(",")}`);
	if (rule.bymonthday?.length)
		parts.push(`BYMONTHDAY=${rule.bymonthday.join(",")}`);
	if (rule.bymonth?.length) parts.push(`BYMONTH=${rule.bymonth.join(",")}`);
	return parts.join(";");
}

type WallClock = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

/** One formatter per zone; expansion asks for the same zone thousands of times. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	const cached = formatters.get(timeZone);
	if (cached) return cached;
	const created = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	formatters.set(timeZone, created);
	return created;
}

function wallClockIn(instant: Date, timeZone: string): WallClock {
	const parts = formatterFor(timeZone).formatToParts(instant);
	const get = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");
	// Intl renders midnight as hour 24 in some engines.
	const hour = get("hour") % 24;
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour,
		minute: get("minute"),
		second: get("second"),
	};
}

/** Milliseconds between a zone's wall clock and UTC at a given instant. */
function zoneOffset(instant: Date, timeZone: string): number {
	const w = wallClockIn(instant, timeZone);
	const asUTC = Date.UTC(
		w.year,
		w.month - 1,
		w.day,
		w.hour,
		w.minute,
		w.second,
	);
	// The wall clock carries no milliseconds, so compare on whole seconds.
	return asUTC - (instant.getTime() - instant.getMilliseconds());
}

/**
 * Turns a wall clock reading into the instant it denotes in `timeZone`.
 * Two passes, because the offset itself depends on the instant we are looking
 * for; the second pass settles everything except the hour a daylight saving
 * jump skips or repeats, where any answer is a convention anyway.
 */
function instantFromWallClock(wall: WallClock, timeZone: string): Date {
	const asUTC = Date.UTC(
		wall.year,
		wall.month - 1,
		wall.day,
		wall.hour,
		wall.minute,
		wall.second,
	);
	let guess = asUTC - zoneOffset(new Date(asUTC), timeZone);
	guess = asUTC - zoneOffset(new Date(guess), timeZone);
	return new Date(guess);
}

function toICALTime(wall: WallClock, isDate: boolean): ICAL.Time {
	// Floating time on purpose: the zone is applied afterwards by
	// instantFromWallClock, which is what keeps the local hour stable across a
	// daylight saving change.
	return new ICAL.Time(
		{
			year: wall.year,
			month: wall.month,
			day: wall.day,
			hour: isDate ? 0 : wall.hour,
			minute: isDate ? 0 : wall.minute,
			second: isDate ? 0 : wall.second,
			isDate,
		},
		ICAL.Timezone.localTimezone,
	);
}

function fromICALTime(time: ICAL.Time): WallClock {
	return {
		year: time.year,
		month: time.month,
		day: time.day,
		hour: time.hour,
		minute: time.minute,
		second: time.second,
	};
}

/**
 * The zone an event's `start` has to be read in.
 *
 * A DTSTART without a TZID — a whole-day date, or a floating time — is turned
 * into a `Date` at *local* midnight by ical.js, not at UTC midnight. Reading it
 * back as UTC shifts a whole-day event by a day in any zone east of Greenwich,
 * which is how a birthday ends up reported one day early.
 *
 * A TZID is whatever the writing client put there. Exchange and some older
 * tools emit Windows zone names ("W. Europe Standard Time") that `Intl` refuses,
 * so an unusable zone falls back to the local one rather than throwing and
 * taking the whole query down with it.
 */
function zoneOf(event: Event): string {
	const local = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const declared = event.startTzid;
	if (!declared) return local;
	try {
		formatterFor(declared);
		return declared;
	} catch {
		return local;
	}
}

/**
 * Identifies an occurrence by its wall clock rather than by an instant.
 *
 * RECURRENCE-ID and EXDATE both name an occurrence in the series' own local
 * terms, and ts-caldav hands them over as a bare `2026-08-21T14:30:00` with the
 * TZID parameter already dropped. Comparing wall clocks sidesteps the missing
 * zone entirely.
 */
function occurrenceKey(wall: WallClock, isDate: boolean): string {
	const day = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
	return isDate
		? day
		: `${day}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

/** Normalises a stored RECURRENCE-ID or EXDATE into the same shape. */
export function toOccurrenceKey(
	value: string,
	isDate: boolean,
): string | undefined {
	const trimmed = value.trim().replace(/Z$/, "");
	const iso = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/,
	);
	const basic = trimmed.match(
		/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/,
	);
	const m = iso ?? basic;
	if (!m) return undefined;
	const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
	return isDate ? `${y}-${mo}-${d}` : `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function asArray(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Occurrences the series itself declares as skipped.
 *
 * ts-caldav keeps EXDATE in `customFields` and retains only the first value of
 * each property, so a property listing several dates at once contributes just
 * one of them. Excluding what does arrive still beats excluding nothing; the
 * alternative is showing meetings that were cancelled.
 */
function exceptionKeys(event: Event, isDate: boolean): Set<string> {
	const keys = new Set<string>();
	for (const entry of asArray(event.customFields?.exdate)) {
		for (const piece of entry.split(",")) {
			const key = toOccurrenceKey(piece, isDate);
			if (key) keys.add(key);
		}
	}
	return keys;
}

/** The RECURRENCE-ID of an event, if it is a replacement for one occurrence. */
function recurrenceIdOf(event: Event): string | undefined {
	const raw = event.customFields?.["recurrence-id"];
	return typeof raw === "string" ? raw : undefined;
}

/**
 * Start instants of every occurrence of `event` inside `[windowStart, windowEnd)`.
 * A single event yields at most one entry. Expansion runs on the wall clock of
 * the event's own zone, so a weekly 14:00 appointment stays at 14:00 across a
 * daylight saving change instead of drifting by an hour.
 *
 * `replaced` holds the keys of occurrences that a separate override event
 * stands in for; those are skipped so a rescheduled meeting is not reported
 * twice, once at its old slot and once at its new one.
 */
export function occurrencesWithin(
	event: Event,
	windowStart: Date,
	windowEnd: Date,
	replaced: ReadonlySet<string> = new Set(),
): Date[] {
	const startsInWindow = (instant: Date) =>
		instant >= windowStart && instant < windowEnd;

	if (!event.recurrenceRule) {
		return startsInWindow(event.start) ? [event.start] : [];
	}

	const rruleString = toRRuleString(event.recurrenceRule);
	if (!rruleString.startsWith("FREQ=")) {
		// Nothing usable to expand; report the master rather than dropping it.
		return startsInWindow(event.start) ? [event.start] : [];
	}

	const timeZone = zoneOf(event);
	const isDate = event.wholeDay === true;
	const skip = exceptionKeys(event, isDate);

	// Compare in wall clock while walking, so reaching a window decades after
	// the series began costs no zone conversions at all.
	const margin = WALL_CLOCK_MARGIN_DAYS * 24 * 60 * 60 * 1000;
	const lower = toICALTime(
		wallClockIn(new Date(windowStart.getTime() - margin), timeZone),
		false,
	);
	const upper = toICALTime(
		wallClockIn(new Date(windowEnd.getTime() + margin), timeZone),
		false,
	);

	const iterator = ICAL.Recur.fromString(rruleString).iterator(
		toICALTime(wallClockIn(event.start, timeZone), isDate),
	);

	const found: Date[] = [];
	for (let step = 0; step < MAX_STEPS; step += 1) {
		const next = iterator.next();
		if (!next) break;
		if (next.compare(upper) > 0) break;
		if (next.compare(lower) < 0) continue;

		const wall = fromICALTime(next);
		const key = occurrenceKey(wall, isDate);
		if (skip.has(key) || replaced.has(key)) continue;

		const instant = instantFromWallClock(wall, timeZone);
		if (startsInWindow(instant)) found.push(instant);
	}
	return found;
}

/**
 * Keys of the occurrences that `events` replace, grouped by the uid of the
 * series they belong to.
 */
export function replacedOccurrences(
	events: readonly Event[],
): Map<string, Set<string>> {
	const byUid = new Map<string, Set<string>>();
	for (const event of events) {
		const raw = recurrenceIdOf(event);
		if (!raw) continue;
		const key = toOccurrenceKey(raw, event.wholeDay === true);
		if (!key) continue;
		const keys = byUid.get(event.uid) ?? new Set<string>();
		keys.add(key);
		byUid.set(event.uid, keys);
	}
	return byUid;
}
