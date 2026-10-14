/**
 * Converts an ISO 8601 datetime string to a `Date` representing the same
 * calendar date at UTC midnight, for use with whole-day events.
 *
 * ts-caldav derives the `VALUE=DATE` it writes to the server by calling
 * `date.toISOString().split("T")[0]` on the `Date` it's given. A `Date`
 * built with `new Date(iso)` preserves the input's UTC *instant*, not its
 * local calendar date — so for any offset east of UTC, that truncation
 * silently rolls the stored date back by one day (e.g. local midnight
 * `2026-09-30T00:00:00+09:00` becomes `2026-09-29T15:00:00.000Z`, which
 * truncates to `2026-09-29`). Anchoring the date at UTC midnight instead
 * makes the truncation a no-op, so the calendar date the caller wrote is
 * the calendar date that gets stored.
 */
export function toWholeDayDate(iso: string): Date {
	return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}
