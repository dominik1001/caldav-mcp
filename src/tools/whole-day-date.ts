import type { Event } from "ts-caldav";

// ts-caldav and ical.js disagree about how a whole-day (`VALUE=DATE`) value is
// represented as a `Date`. ts-caldav writes each date it stores (DTSTART,
// DTEND, RRULE UNTIL, EXDATE, RDATE, RECURRENCE-ID) with
// `date.toISOString().split("T")[0]` (the UTC calendar day) and takes `end` as
// inclusive, adding a day itself to produce the exclusive DTEND. ical.js reads
// a `VALUE=DATE` back as local midnight, and reports DTEND as is (exclusive).
// The helpers below anchor a calendar day at UTC midnight, so the writer's
// `toISOString()` truncation stores exactly the day that was meant.

/**
 * Converts an ISO 8601 datetime string to a `Date` representing the same
 * calendar date at UTC midnight, for use with whole-day events.
 *
 * A `Date` built with `new Date(iso)` preserves the input's UTC *instant*, not
 * its calendar date, so for any offset east of UTC ts-caldav's truncation
 * silently rolls the stored date back by one day (e.g. local midnight
 * `2026-09-30T00:00:00+09:00` becomes `2026-09-29T15:00:00.000Z`, which
 * truncates to `2026-09-29`). Taking the date part of the string as written
 * makes the truncation a no-op, so the calendar date the caller wrote is the
 * calendar date that gets stored.
 */
export function toWholeDayDate(iso: string): Date {
	return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Anchors the local calendar day of a `Date` read from the server at UTC
 * midnight, so ts-caldav's writer stores that day again.
 *
 * ical.js hands a `VALUE=DATE` back as local midnight, which `toISOString()`
 * turns into the previous day in any zone east of UTC. For a timed value
 * (when a timed event becomes whole-day) the local day is the day the event
 * shows on in this server's zone, which is also what UTC truncation misses.
 */
export function localDayToWholeDayDate(value: Date): Date {
	return new Date(
		Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
	);
}

/**
 * Turns an end read from the server into the inclusive last day ts-caldav's
 * writer expects, anchored at UTC midnight.
 *
 * A whole-day DTEND is exclusive (local midnight after the last day) and a
 * timed end is the instant the event stops, so in both cases the last day is
 * the local day of the instant just before `end`. It is never earlier than
 * the start's day, so a zero-length event (DTEND equal to DTSTART) stays a
 * valid one-day range instead of ending before it starts.
 */
export function inclusiveEndToWholeDayDate(end: Date, start: Date): Date {
	const last = localDayToWholeDayDate(new Date(end.getTime() - 1));
	const first = localDayToWholeDayDate(start);
	return last < first ? first : last;
}

/**
 * Reshapes every date of a stored event that an update carries over, so a
 * whole-day event keeps its days when the caller changes something else.
 *
 * Covers DTSTART and DTEND as well as RRULE UNTIL, EXDATE, RDATE and
 * RECURRENCE-ID: ts-caldav reads and writes them all the way described above,
 * so leaving any one of them out moves it a day earlier east of UTC (an UNTIL
 * that drops the last occurrence, an EXDATE that no longer excludes
 * anything). Values the caller passes explicitly override these.
 */
export function carryOverWholeDayDates(existing: Event): Partial<Event> {
	const carried: Partial<Event> = {
		start: localDayToWholeDayDate(existing.start),
	};
	// Events built outside ts-caldav's parser can lack DTEND.
	const end = existing.end as Date | undefined;
	if (end) {
		carried.end = inclusiveEndToWholeDayDate(end, existing.start);
	}
	if (existing.recurrenceRule?.until) {
		carried.recurrenceRule = {
			...existing.recurrenceRule,
			until: localDayToWholeDayDate(existing.recurrenceRule.until),
		};
	}
	if (existing.exdates) {
		carried.exdates = existing.exdates.map(localDayToWholeDayDate);
	}
	if (existing.rdates) {
		carried.rdates = existing.rdates.map(localDayToWholeDayDate);
	}
	if (existing.recurrenceId) {
		carried.recurrenceId = localDayToWholeDayDate(existing.recurrenceId);
	}
	return carried;
}
