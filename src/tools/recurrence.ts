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

/** Guards against an unbounded rule combined with a far away window. */
const MAX_OCCURRENCES = 10_000;

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

function wallClockIn(instant: Date, timeZone: string): WallClock {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(instant);
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
 * for; the second pass settles everything except the hour that a DST jump
 * skips, where any answer is a convention anyway.
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
 */
function zoneOf(event: Event): string {
	return (
		event.startTzid || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
	);
}

function asArray(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Instants the series skips. ts-caldav keeps EXDATE in `customFields` and only
 * retains the first value of each property, so a property listing several
 * dates at once contributes just one. Excluding what we can beats excluding
 * nothing; the alternative is showing meetings that were cancelled.
 */
function exceptionInstants(event: Event, timeZone: string): Set<number> {
	const raw = asArray(event.customFields?.exdate).concat(
		asArray(event.customFields?.EXDATE),
	);
	const instants = new Set<number>();
	for (const entry of raw) {
		for (const piece of entry.split(",")) {
			const parsed = new Date(piece.trim());
			if (!Number.isNaN(parsed.getTime())) {
				instants.add(parsed.getTime());
				continue;
			}
			// Bare iCalendar form, e.g. 20251202T140000 without a zone marker.
			const match = piece
				.trim()
				.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
			if (!match) continue;
			const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
			instants.add(
				instantFromWallClock(
					{
						year: Number(y),
						month: Number(mo),
						day: Number(d),
						hour: Number(h),
						minute: Number(mi),
						second: Number(s),
					},
					timeZone,
				).getTime(),
			);
		}
	}
	return instants;
}

/**
 * Start instants of every occurrence of `event` inside `[windowStart, windowEnd)`.
 * A single event yields at most one entry. Expansion runs on the wall clock of
 * the event's own zone, so a weekly 14:00 appointment stays at 14:00 across a
 * daylight saving change instead of drifting by an hour.
 */
export function occurrencesWithin(
	event: Event,
	windowStart: Date,
	windowEnd: Date,
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
	const excluded = exceptionInstants(event, timeZone);

	const iterator = ICAL.Recur.fromString(rruleString).iterator(
		toICALTime(wallClockIn(event.start, timeZone), isDate),
	);

	const found: Date[] = [];
	for (let seen = 0; seen < MAX_OCCURRENCES; seen += 1) {
		const next = iterator.next();
		if (!next) break;
		const instant = instantFromWallClock(fromICALTime(next), timeZone);
		if (instant >= windowEnd) break;
		if (startsInWindow(instant) && !excluded.has(instant.getTime())) {
			found.push(instant);
		}
	}
	return found;
}
