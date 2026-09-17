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
 * The same token travels in the API calls that page makes —
 * `/api/guardian/consent/<token>/approve` and its siblings — and every one of
 * those is a fetch breadcrumb too. And the very first version of the email
 * carried it as `?token=`, so a query value of that name is scrubbed as well.
 *
 * Nothing here is about hiding failures. The path still arrives as
 * `/guardian/[token]` or `/guardian/consent/[redacted]/approve`, so the page
 * and the call are just as identifiable as any other route; the only thing
 * lost is the part that grants access.
 *
 * WHY A SHARED MODULE. It runs in all three Sentry runtimes — browser, node and
 * edge. A server-side render of that route, or the request error Next reports
 * through `captureRequestError`, carries the same URL as a browser crash does.
 */

/**
 * THESE TWO MUST STAY REGEX LITERALS. They were built with `new RegExp()` from
 * template literals joined by `+`, and Next 16.2.1's production minifier
 * (Turbopack/SWC) folds that shape wrongly when the `${}` values are constants:
 * it drops the text after each `${}`, so the bundle shipped
 * `RegExp("/(guardian((?:/(?:consent/[^/?#\s\"']+", "gi")` — an unterminated
 * group that throws at module evaluation. This module loads before hydration
 * (`instrumentation-client.ts`) and in the server and edge Sentry configs, so
 * the whole app went blank. Nothing catches it in test either: Vitest and
 * `next dev --webpack` do not minify, so all the tests below still passed.
 * Do not turn these back into `new RegExp` + template literals.
 *
 * SECRET_PATH_PATTERN matches `/<prefix>/<secret>`, where the secret is one
 * path segment: everything up to the next slash, query, fragment, space or
 * quote. Group 1 is the prefix — another one goes in as `(guardian|other)`.
 * Group 2 is the segment allowed to sit BETWEEN the prefix and the credential
 * and kept, or "": the consent page's API calls are
 * `/guardian/consent/<token>/approve`, and a rule that only knew
 * `/guardian/<secret>` ate the word `consent` and left the token standing —
 * the exact opposite of the job. Another kept segment goes in as
 * `(?:consent|other)`. Inside the character class `/` stays unescaped, or
 * eslint's no-useless-escape complains.
 */
const SECRET_PATH_PATTERN = /\/(guardian)((?:\/(?:consent))?)\/[^/?#\s"']+/gi

// `[?&]` and not a bare `token=`: `access_token=` is somebody else's secret
// with its own rules, and a word that merely ends in "token" is not a match.
// Another query parameter goes in as `(?:token|other)`.
const SECRET_QUERY_PATTERN = /([?&](?:token)=)[^&#\s"']*/gi

/** Replace any secret path segment or query value in a string. Safe on non-URLs. */
export function redactSecretPaths<T>(value: T): T {
  if (typeof value !== "string") return value

  return value
    .replace(
      SECRET_PATH_PATTERN,
      (_match, prefix: string, kept: string) => `/${prefix}${kept}/[redacted]`,
    )
    .replace(
      SECRET_QUERY_PATTERN,
      (_match, key: string) => `${key}[redacted]`,
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
