/**
 * Sentry — Edge runtime (middleware and any edge route).
 *
 * Separate from the Node config because the edge runtime has no Node APIs and
 * the SDK ships a different build for it; loaded by src/instrumentation.ts
 * when NEXT_RUNTIME is "edge".
 */

import * as Sentry from "@sentry/nextjs"

// Same gate as the server config — see there.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0,
  })
}
