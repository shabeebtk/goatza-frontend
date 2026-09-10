/**
 * Sentry — browser.
 *
 * v10 replaced sentry.client.config.ts with this file; the SDK warns at
 * runtime if both exist, so there is deliberately only one Sentry.init() on
 * the client and it is here.
 */

import * as Sentry from "@sentry/nextjs"

import { scrubBreadcrumb, scrubEvent } from "@/core/observability/redact"

// Inlined at build time by Next (NEXT_PUBLIC_*), so a build made without the
// var produces a bundle that can never initialise — which is the intent.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",

    // Errors only. No tracing, and no replayIntegration() — the SDK does not
    // add Session Replay on its own, so leaving it out is what keeps it off.
    // Session Replay would record a child's screen; it stays out.
    tracesSampleRate: 0,

    /*
      OFF, EXPLICITLY, on a platform where a large share of accounts belong to
      people under 18.

      The flag is absent-by-default in the SDK, which is not the same as being
      decided: the Sentry wizard writes it as `true` into a fresh config, and a
      re-run of it, an SDK upgrade or a copy-paste from their docs would turn on
      IP addresses, cookies and request bodies here without anybody meaning to.
      Written down, it survives all three.
    */
    sendDefaultPii: false,

    /*
      `/guardian/<token>` is a live consent credential for a specific child, and
      it travels as a URL — which is exactly what Sentry attaches to events and
      breadcrumbs. Both hooks scrub it; see core/observability/redact.
    */
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
}

/** Next's navigation hook. A no-op while tracing is off, but part of the layout. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
