/**
 * Sentry — Node.js server runtime.
 *
 * Loaded by src/instrumentation.ts when NEXT_RUNTIME is "nodejs". The SDK's
 * v10 layout keeps this at the project root even when the app lives in src/,
 * because instrumentation.ts is the only thing that imports it.
 */

import * as Sentry from "@sentry/nextjs"

// No DSN, no SDK. An unset var is the normal state locally and on any preview
// that has not been given one, and the app has to behave exactly as it did
// before Sentry existed — so this is a hard gate, not a default.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",

    // Errors only for now. Tracing is a separate decision with its own quota
    // cost, so it is off rather than sampled low.
    tracesSampleRate: 0,
  })
}
