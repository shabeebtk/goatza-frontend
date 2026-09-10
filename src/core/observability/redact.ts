/**
 * Secrets that live in a URL, taken back out before an error leaves the app.
 *
 * THE PROBLEM. `/guardian/<token>` is the parent consent page, and that token
 * is the whole credential — anyone holding it can approve or withdraw consent
 * for a specific child, with no login. Sentry's defaults will happily carry it
 * out of the browser: `event.request.url` is the page the error happened on,
 * and every fetch and navigation lays down a breadcrumb with its URL attached.
 * One unrelated crash on that page and a live consent link is sitting in an
 * error tracker, in a third party's storage, readable by anybody on the team.
 *
 * Nothing here is about hiding failures. The path still arrives as
 * `/guardian/[token]`, so the page is just as identifiable as any other route;
 * the only thing lost is the part that grants access.
 *
 * WHY A SHARED MODULE. It runs in all three Sentry runtimes — browser, node and
 * edge. A server-side render of that route, or the request error Next reports
 * through `captureRequestError`, carries the same URL as a browser crash does.
 */

/**
 * Path segments whose NEXT segment is a credential.
 *
 * Add to this rather than writing a second scrubber. Anything shaped
 * `/<prefix>/<secret>` belongs here.
 */
const SECRET_PATH_PREFIXES = ["guardian"]

const SECRET_PATH_PATTERN = new RegExp(
  `/(${SECRET_PATH_PREFIXES.join("|")})/[^/?#\s"']+`,
  "gi",
)

/** Replace any secret path segment in a string. Safe on non-URLs. */
export function redactSecretPaths<T>(value: T): T {
  if (typeof value !== "string") return value

  return value.replace(
    SECRET_PATH_PATTERN,
    (_match, prefix: string) => `/${prefix}/[redacted]`,
  ) as unknown as T
}

/** The fields on a Sentry breadcrumb that can hold a URL. */
type ScrubbableBreadcrumb = {
  message?: string
  data?: { url?: string; from?: string; to?: string; [key: string]: unknown }
}

/** Scrub one breadcrumb in place and hand it back. */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(
  breadcrumb: T,
): T {
  if (breadcrumb.message) {
    breadcrumb.message = redactSecretPaths(breadcrumb.message)
  }

  const data = breadcrumb.data
  if (data) {
    // Navigation breadcrumbs use from/to; fetch and xhr use url. Nothing else
    // in the default set carries a path.
    if (typeof data.url === "string") data.url = redactSecretPaths(data.url)
    if (typeof data.from === "string") data.from = redactSecretPaths(data.from)
    if (typeof data.to === "string") data.to = redactSecretPaths(data.to)
  }

  return breadcrumb
}

/** The fields on a Sentry event that can hold a URL. */
type ScrubbableEvent = {
  request?: { url?: string; headers?: Record<string, string> }
  breadcrumbs?: ScrubbableBreadcrumb[]
  transaction?: string
}

/**
 * Scrub a whole event in place and hand it back.
 *
 * Breadcrumbs are done here as well as in `beforeBreadcrumb` on purpose: the
 * two hooks do not both fire for every breadcrumb on every integration, and a
 * token that escapes because one of them was skipped is not a bug worth
 * discovering from a security report.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request?.url) {
    event.request.url = redactSecretPaths(event.request.url)
  }

  // The Referer names the page the user came FROM, which on this flow is the
  // consent page itself.
  const referer = event.request?.headers?.Referer
  if (typeof referer === "string" && event.request?.headers) {
    event.request.headers.Referer = redactSecretPaths(referer)
  }

  if (event.transaction) {
    event.transaction = redactSecretPaths(event.transaction)
  }

  event.breadcrumbs?.forEach(scrubBreadcrumb)

  return event
}
