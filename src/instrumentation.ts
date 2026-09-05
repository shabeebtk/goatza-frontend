/**
 * Next.js server instrumentation hook.
 *
 * Runs once per server runtime before anything else, which is why the Sentry
 * SDK's v10 layout initialises the server and edge SDKs from here rather than
 * from a module some route happens to import first.
 */

import * as Sentry from "@sentry/nextjs"

export async function register() {
  // Dynamic, and split by runtime, because the two configs pull different SDK
  // builds — importing the Node one into the edge runtime fails at build time.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config")
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}

/**
 * Next calls this for every server-side render/route error.
 *
 * Safe to export unconditionally: with no DSN neither config above called
 * Sentry.init(), so there is no client for this to report to and it no-ops.
 */
export const onRequestError = Sentry.captureRequestError
