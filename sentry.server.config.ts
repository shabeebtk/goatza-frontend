/**
 * Sentry — Node.js server runtime.
 *
 * Loaded by src/instrumentation.ts when NEXT_RUNTIME is "nodejs". The SDK's
 * v10 layout keeps this at the project root even when the app lives in src/,
 * because instrumentation.ts is the only thing that imports it.
 */

import * as Sentry from "@sentry/nextjs"

import { scrubBreadcrumb, scrubEvent } from "@/core/observability/redact"

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
