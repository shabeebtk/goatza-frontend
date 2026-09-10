/**
 * Sentry — Edge runtime (middleware and any edge route).
 *
 * Separate from the Node config because the edge runtime has no Node APIs and
 * the SDK ships a different build for it; loaded by src/instrumentation.ts
 * when NEXT_RUNTIME is "edge".
 */

import * as Sentry from "@sentry/nextjs"

import { scrubBreadcrumb, scrubEvent } from "@/core/observability/redact"

// Same gate as the server config — see there.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
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
