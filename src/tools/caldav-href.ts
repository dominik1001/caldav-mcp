/**
 * Builds the CalDAV object href (`<calendar>/<uid>.ics`) used to address a
 * single event or todo. Mirrors how ts-caldav stores objects, tolerating a
 * calendar URL with or without a trailing slash.
 */
export function hrefFor(calendarUrl: string, uid: string): string {
	const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
	return `${base}${uid}.ics`;
}

/**
 * Resolves a server-relative calendar href (as ts-caldav returns it) against
 * the configured base URL, so agents get a URL they can pass back verbatim
 * instead of guessing how to prefix it. Hrefs that are already absolute are
 * left as they are. Credentials in the base URL are dropped: the result is
 * shown to the LLM.
 */
export function toAbsoluteUrl(href: string, baseUrl: string | undefined) {
	if (!href || !baseUrl) return href;
	try {
		const url = new URL(href, baseUrl);
		url.username = "";
		url.password = "";
		return url.toString();
	} catch {
		return href;
	}
}

/**
 * Inverse of `toAbsoluteUrl`: turns an absolute calendar URL on the configured
 * server back into the server-relative path. ts-caldav writes object hrefs
 * into calendar-multiget bodies verbatim, and not every server accepts
 * absolute URLs there, so tools hand it paths only. Relative input and URLs
 * on another origin pass through unchanged.
 */
export function toCalendarPath(
	calendarUrl: string,
	baseUrl: string | undefined,
) {
	if (!baseUrl) return calendarUrl;
	try {
		const url = new URL(calendarUrl);
		if (url.origin !== new URL(baseUrl).origin) return calendarUrl;
		return `${url.pathname}${url.search}`;
	} catch {
		return calendarUrl;
	}
}
