/**
 * The diagnostics attached to a problem report.
 *
 * "It doesn't work" is not a fixable report. Which page, which viewport, which
 * build, which platform and what the connection was doing is usually the
 * difference between a bug we can reproduce and one we cannot — and it is
 * information the reporter cannot be expected to type.
 *
 * EXACTLY the keys the backend allow-lists, and nothing more. Anything else is
 * dropped server-side without comment, so sending it would only mean
 * collecting more about a person than we use. The sheet tells them what is in
 * here; this file is the list that has to match what it says.
 *
 * The USER AGENT is deliberately absent: the server reads that header off the
 * request itself, and sending a second, client-controlled copy would be a
 * field that can disagree with the real one.
 *
 * EVERY BROWSER READ IS GUARDED. This runs in a client component, but
 * `navigator.connection` is not in Safari at all, `navigator.platform` is
 * deprecated and being removed, and `Intl` can throw in a locked-down
 * environment. A report that fails to send because the diagnostics threw is
 * strictly worse than one with a blank field.
 */

import { useAuthStore } from "@/store/auth.store"

import type { ProblemClientContext } from "./support.api"

/** Read `fn()` as a string, or "" if the browser has no such thing. */
const safe = (fn: () => unknown): string => {
  try {
    const value = fn()
    return value == null ? "" : String(value)
  } catch {
    return ""
  }
}

export type ClientContextOptions = {
  /**
   * Include `actor_type`. False on the LOGGED-OUT form, where there is no
   * actor: the store's default is "user", and sending that from a visitor with
   * no session would put a value in the admin that reads as a fact and is not
   * one.
   */
  includeActorType?: boolean
}

export const buildClientContext = (
  { includeActorType = true }: ClientContextOptions = {}
): ProblemClientContext => {
  // A server render has no window. Nothing here is worth a crash on the way to
  // hydration, and both callers only build this at submit time anyway.
  if (typeof window === "undefined") return {}

  const context: ProblemClientContext = {
    // Where they were. The single most useful field in the whole blob — the
    // search string included, since "the profile page" and "the profile page
    // with ?tab=highlights" are frequently two different bugs.
    path: safe(() => window.location.pathname + window.location.search),

    // Which build. Unset in most environments, hence the explicit "unknown"
    // rather than a blank: "we don't stamp a version" and "the version was
    // empty" should not look the same in the admin.
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",

    // Layout bugs are viewport bugs. Cheaper and more honest than a device
    // name, which tells us nothing about how the page was actually sized.
    viewport: safe(() => `${window.innerWidth}x${window.innerHeight}`),

    // Anything date- or time-shaped is a timezone bug until proven otherwise.
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),

    // Deprecated and missing in some browsers — hence `safe`, and hence not
    // relied on for anything but a hint.
    platform: safe(() => navigator.platform),

    // "slow-2g" | "2g" | "3g" | "4g" where the Network Information API exists,
    // which is most Android browsers and no Safari. Half of "the app is slow"
    // is answered by this one string.
    network: safe(
      () =>
        (navigator as Navigator & { connection?: { effectiveType?: string } })
          .connection?.effectiveType
    ),

  }

  // Which hat they were wearing. The backend records `acting_org` from the
  // request headers anyway, but this says what the UI believed at the time —
  // and the two disagreeing IS the bug in some reports.
  if (includeActorType) {
    context.actor_type = safe(() => useAuthStore.getState().actorType)
  }

  return context
}
