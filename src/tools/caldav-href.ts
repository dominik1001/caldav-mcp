/**
 * Builds the CalDAV object href (`<calendar>/<uid>.ics`) used to address a
 * single event or todo. Mirrors how ts-caldav stores objects, tolerating a
 * calendar URL with or without a trailing slash.
 */
export function hrefFor(calendarUrl: string, uid: string): string {
	const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
	return `${base}${uid}.ics`;
}
