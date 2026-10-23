// ts-caldav and ical.js disagree about how a whole-day (`VALUE=DATE`) boundary
// is represented as a `Date`. ts-caldav writes the date it stores with
// `date.toISOString().split("T")[0]` (the UTC calendar day) and takes `end` as
// inclusive, adding a day itself to produce the exclusive DTEND. ical.js reads
// a `VALUE=DATE` back as local midnight, and reports DTEND as is (exclusive).
// Both helpers below anchor a calendar day at UTC midnight, so the writer's
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
 * Reshapes a stored whole-day DTSTART, as read back by ical.js, into what
 * ts-caldav's writer expects.
 *
 * ical.js hands us local midnight, which `toISOString()` turns into the
 * previous day in any zone east of UTC. Anchoring the same local calendar day
 * at UTC midnight makes that conversion a no-op.
 */
export function storedStartToWholeDayDate(value: Date): Date {
	return new Date(
		Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
	);
}

/**
 * Reshapes a stored whole-day DTEND, as read back by ical.js, into what
 * ts-caldav's writer expects.
 *
 * Besides the local-midnight shift handled by `storedStartToWholeDayDate`, the
 * reader reports DTEND exclusively while the writer takes `end` inclusively
 * and adds the day back itself. So step back one day to get the inclusive last
 * day, anchored at UTC midnight.
 */
export function storedEndToWholeDayDate(value: Date): Date {
	const inclusive = storedStartToWholeDayDate(value);
	inclusive.setUTCDate(inclusive.getUTCDate() - 1);
	return inclusive;
}
