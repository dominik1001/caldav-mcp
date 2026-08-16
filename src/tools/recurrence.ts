import ICAL from "ical.js";
import type { Event, RecurrenceRule } from "ts-caldav";

/**
 * Client side expansion of recurring events.
 *
 * `getEvents` asks the server to expand a series (RFC 4791 `<C:expand>`), but a
 * server may ignore it: Open-Xchange, and so mailbox.org, returns the master
 * with its RRULE untouched, so a query for next week answers with the DTSTART
 * of a series that began years ago. Where the server did the work, events
 * arrive without a rule and pass straight through.
 *
 * Two limits come from what ts-caldav models. A rule keeps only FREQ, INTERVAL,
 * COUNT, UNTIL, WKST, BYDAY, BYMONTHDAY and BYMONTH, so one built on BYSETPOS
 * ("last weekday of the month") expands too generously. And only the first
 * value of a repeated EXDATE survives, so a line cancelling several dates at
 * once excludes one of them.
 */

/** Stops a rule that never terminates. */
const MAX_STEPS = 100_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far outside the window a candidate may look before it is discarded. */
const MARGIN_MS = DAY_MS;

const NO_KEYS: ReadonlySet<string> = new Set();

let systemZoneCache: string | undefined;

function systemZone(): string {
	if (!systemZoneCache) {
		systemZoneCache = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	}
	return systemZoneCache;
}

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

/**
 * The instant as it reads on a clock in `timeZone`, as a floating ICAL.Time.
 * Floating on purpose: `instantOf` applies the zone again, and that pair is what
 * keeps a weekly 14:00 appointment at 14:00 across a daylight saving change.
 */
function floatingTimeIn(
	instant: Date,
	timeZone: string,
	isDate = false,
): ICAL.Time {
	let year = 0;
	let month = 1;
	let day = 1;
	let hour = 0;
	let minute = 0;
	let second = 0;
	for (const part of formatterFor(timeZone).formatToParts(instant)) {
		const value = Number(part.value);
		if (part.type === "year") year = value;
		else if (part.type === "month") month = value;
		else if (part.type === "day") day = value;
		// Some engines render midnight as hour 24.
		else if (part.type === "hour") hour = value % 24;
		else if (part.type === "minute") minute = value;
		else if (part.type === "second") second = value;
	}
	return new ICAL.Time(
		{
			year,
			month,
			day,
			hour: isDate ? 0 : hour,
			minute: isDate ? 0 : minute,
			second: isDate ? 0 : second,
			isDate,
		},
		ICAL.Timezone.localTimezone,
	);
}

/** Milliseconds between a zone's wall clock and UTC at a given instant. */
function zoneOffset(instant: Date, timeZone: string): number {
	const w = floatingTimeIn(instant, timeZone);
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
 * The instant a floating time denotes in `timeZone`. Two passes, because the
 * offset depends on the instant being looked for; only the hour a daylight
 * saving jump skips or repeats stays a matter of convention.
 */
function instantOf(time: ICAL.Time, timeZone: string): Date {
	const asUTC = Date.UTC(
		time.year,
		time.month - 1,
		time.day,
		time.hour,
		time.minute,
		time.second,
	);
	let guess = asUTC - zoneOffset(new Date(asUTC), timeZone);
	guess = asUTC - zoneOffset(new Date(guess), timeZone);
	return new Date(guess);
}

/**
 * The zone an event's `start` has to be read in. A DTSTART without a TZID
 * becomes a `Date` at *local* midnight, so reading it as UTC moves a whole-day
 * event a day east of Greenwich. A TZID is whatever the writing client put
 * there, and Exchange emits Windows zone names `Intl` refuses, so an unusable
 * one falls back instead of taking the whole query down.
 */
function zoneOf(event: Event): string {
	if (!event.startTzid) return systemZone();
	try {
		formatterFor(event.startTzid);
		return event.startTzid;
	} catch {
		return systemZone();
	}
}

/**
 * Normalises a stored RECURRENCE-ID or EXDATE for comparison. Both name a slot
 * in the series' own local terms, and ts-caldav drops the TZID parameter on the
 * way through, so matching happens on the wall clock.
 */
export function toOccurrenceKey(
	value: string,
	isDate: boolean,
): string | undefined {
	const m = value
		.trim()
		.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2}))?/);
	if (!m) return undefined;
	const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
	return isDate ? `${y}-${mo}-${d}` : `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function asArray(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function exceptionKeys(event: Event, isDate: boolean): Set<string> {
	const keys = new Set<string>();
	for (const entry of asArray(event.customFields?.exdate)) {
		const key = toOccurrenceKey(entry, isDate);
		if (key) keys.add(key);
	}
	return keys;
}

/**
 * The slot a replacement event stands in for, if it is one. An event carrying a
 * rule of its own is not treated as a replacement: RFC 5545 does not allow the
 * combination, and honouring it would stamp every occurrence it expands into
 * with the same key.
 */
function recurrenceIdKey(event: Event): string | undefined {
	if (event.recurrenceRule?.freq) return undefined;
	const raw = event.customFields?.["recurrence-id"];
	return typeof raw === "string"
		? toOccurrenceKey(raw, event.wholeDay === true)
		: undefined;
}

/** ts-caldav stringifies `wkst` off ical.js, so it is already the right number. */
function toRecur(rule: RecurrenceRule): ICAL.Recur | undefined {
	if (!rule.freq) return undefined;
	const wkst = Number(rule.wkst);
	return ICAL.Recur.fromData({
		freq: rule.freq,
		...(rule.interval ? { interval: rule.interval } : {}),
		...(rule.count ? { count: rule.count } : {}),
		...(rule.until ? { until: ICAL.Time.fromJSDate(rule.until, true) } : {}),
		...(Number.isInteger(wkst) ? { wkst } : {}),
		...(rule.byday?.length ? { BYDAY: rule.byday } : {}),
		...(rule.bymonthday?.length ? { BYMONTHDAY: rule.bymonthday } : {}),
		...(rule.bymonth?.length ? { BYMONTH: rule.bymonth } : {}),
	});
}

/**
 * Moves the iterator's starting point closer to the window. Seeding at DTSTART
 * means walking every occurrence since the series began, some 13,000 steps for a
 * daily series from 1990. Whole periods can be skipped because BYDAY and friends
 * evaluate the phase inside a period, which the jump preserves.
 *
 * Daily and weekly only: monthly and yearly reach the present in a few hundred
 * steps. COUNT is left alone, because there the position from the start decides
 * when the series ends. The jump lands one period short so the iterator, not
 * this arithmetic, picks the first occurrence.
 *
 * Note this hands `iterator()` something other than the real DTSTART, which the
 * ical.js docs do not promise to support. It holds because the jump is an exact
 * multiple of the period and the algorithm only looks at the phase, but an
 * ical.js upgrade is a reason to re-check it.
 */
function seedNear(
	start: ICAL.Time,
	rule: RecurrenceRule,
	windowStart: Date,
	timeZone: string,
): ICAL.Time {
	if (rule.count) return start;
	if (rule.freq !== "DAILY" && rule.freq !== "WEEKLY") return start;

	const days =
		(rule.freq === "WEEKLY" ? 7 : 1) * Math.max(rule.interval ?? 1, 1);
	const from = Date.UTC(start.year, start.month - 1, start.day);
	const target = floatingTimeIn(windowStart, timeZone);
	const to = Date.UTC(target.year, target.month - 1, target.day);
	const periods = Math.floor((to - from) / (days * DAY_MS)) - 1;
	if (periods <= 0) return start;

	const moved = start.clone();
	moved.adjust(periods * days, 0, 0, 0);
	return moved;
}

export type Occurrence = {
	event: Event;
	start: Date;
	/** Wall-clock identity of this slot, in the shape of a RECURRENCE-ID. */
	key: string;
	/** True for a series occurrence, replacement instances included. */
	fromSeries: boolean;
};

function occurrenceStarts(
	event: Event,
	windowStart: Date,
	windowEnd: Date,
	replaced: ReadonlySet<string>,
): Array<{ start: Date; key: string }> {
	const timeZone = zoneOf(event);
	const isDate = event.wholeDay === true;
	const rule = event.recurrenceRule;
	const recur = rule ? toRecur(rule) : undefined;

	if (!recur || !rule) {
		const inWindow = event.start >= windowStart && event.start < windowEnd;
		if (!inWindow) return [];
		const single = floatingTimeIn(event.start, timeZone, isDate);
		return [{ start: event.start, key: single.toString() }];
	}

	const skip = exceptionKeys(event, isDate);
	const filtering = skip.size > 0 || replaced.size > 0;
	// Wall clock while walking: reaching a distant window costs no conversions.
	const lower = floatingTimeIn(
		new Date(windowStart.getTime() - MARGIN_MS),
		timeZone,
	);
	const upper = floatingTimeIn(
		new Date(windowEnd.getTime() + MARGIN_MS),
		timeZone,
	);
	const seed = seedNear(
		floatingTimeIn(event.start, timeZone, isDate),
		rule,
		windowStart,
		timeZone,
	);

	const found: Array<{ start: Date; key: string }> = [];
	const iterator = recur.iterator(seed);
	for (let step = 0; step < MAX_STEPS; step += 1) {
		const next = iterator.next();
		if (!next) break;
		if (next.compare(upper) > 0) break;
		if (next.compare(lower) < 0) continue;

		const key = next.toString();
		if (filtering && (skip.has(key) || replaced.has(key))) continue;

		const start = instantOf(next, timeZone);
		if (start >= windowStart && start < windowEnd) found.push({ start, key });
	}
	return found;
}

/**
 * Start instants of every occurrence inside `[windowStart, windowEnd)`. Prefer
 * `expandEvents`, which also correlates a series with its replacements.
 */
export function occurrencesWithin(
	event: Event,
	windowStart: Date,
	windowEnd: Date,
	replaced: ReadonlySet<string> = NO_KEYS,
): Date[] {
	return occurrenceStarts(event, windowStart, windowEnd, replaced).map(
		(o) => o.start,
	);
}

/**
 * Expands a calendar's events into the occurrences inside the window, oldest
 * first. Moving one instance of a series yields two events sharing a uid: the
 * master with its rule and a replacement carrying RECURRENCE-ID. Seen apart, the
 * master still expands into the slot the replacement vacated and the meeting is
 * reported twice, so the correlation lives here rather than in the caller.
 */
export function expandEvents(
	events: readonly Event[],
	windowStart: Date,
	windowEnd: Date,
): Occurrence[] {
	const replaced = new Map<string, Set<string>>();
	for (const event of events) {
		const key = recurrenceIdKey(event);
		if (!key) continue;
		const keys = replaced.get(event.uid);
		if (keys) keys.add(key);
		else replaced.set(event.uid, new Set([key]));
	}

	const out: Occurrence[] = [];
	for (const event of events) {
		const override = recurrenceIdKey(event);
		const starts = occurrenceStarts(
			event,
			windowStart,
			windowEnd,
			replaced.get(event.uid) ?? NO_KEYS,
		);
		for (const { start, key } of starts) {
			out.push({
				event,
				start,
				// A replacement is identified by the slot it stands in for.
				key: override ?? key,
				fromSeries: Boolean(event.recurrenceRule) || override !== undefined,
			});
		}
	}
	out.sort((a, b) => a.start.getTime() - b.start.getTime());
	return out;
}
