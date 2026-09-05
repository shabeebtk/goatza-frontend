/**
 * Sentry — browser.
 *
 * v10 replaced sentry.client.config.ts with this file; the SDK warns at
 * runtime if both exist, so there is deliberately only one Sentry.init() on
 * the client and it is here.
 */

import * as Sentry from "@sentry/nextjs"

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
    tracesSampleRate: 0,
  })
}

/** Next's navigation hook. A no-op while tracing is off, but part of the layout. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
