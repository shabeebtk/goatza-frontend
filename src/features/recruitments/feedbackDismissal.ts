/**
 * "Not now" on the trial-feedback prompt — suppressed for 7 days, per viewer.
 *
 * DELIBERATELY NOT SENT TO THE SERVER. A dismissal is a convenience for the
 * person holding the phone, not something the org needs or could act on, and
 * a column for it would have to be kept in sync for no reader. `localStorage`
 * is the right scope precisely because it is per-device and disposable.
 *
 * THEREFORE IT MAY VANISH, and that is fine. Cleared site data, a private
 * window, a different device: the prompt comes back. The alternative — a
 * server round trip so a dismissal follows somebody everywhere — buys nothing
 * and costs a write on a screen that is meant to ask once and get out.
 *
 * EVERY ACCESS IS GUARDED. Reading `window.localStorage` THROWS in a private
 * window with site data blocked, not just on read/write, so the whole thing
 * including the property lookup sits inside try/catch. A throw reads as "not
 * dismissed", which shows the prompt — the failure that loses nothing.
 *
 * The decision logic below is pure and takes `now`, so it is testable without
 * a clock or a DOM; the storage functions are the thin, failing-safe edges.
 */

const STORAGE_KEY = "goatza:trialFeedbackDismissed"

/** How long a dismissal holds. */
export const DISMISS_DAYS = 7
export const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

/** `{ [applicationId]: epoch ms when it was dismissed }` */
export type DismissalMap = Record<string, number>

/**
 * Is this application's prompt still suppressed?
 *
 * PURE. A missing entry is not dismissed; so is a corrupt one — anything that
 * is not a finite number in the past week is treated as no dismissal at all,
 * because the only cost of being wrong that way is one more prompt, while the
 * other way silences it forever.
 */
export function isDismissed(
  map: DismissalMap | null | undefined,
  applicationId: string,
  now: number = Date.now(),
): boolean {
  const at = map?.[applicationId]
  if (typeof at !== "number" || !Number.isFinite(at)) return false

  const age = now - at
  // A NEGATIVE age means the stamp is in the future — a clock that was wrong
  // then or is wrong now. Honour it rather than ignoring it: the player did
  // tap dismiss, and re-asking immediately is the worse answer.
  if (age < 0) return true

  return age < DISMISS_MS
}

/**
 * The map with `applicationId` marked dismissed, and every entry that has
 * expired dropped.
 *
 * PRUNING ON WRITE is what keeps this from growing forever: a player who
 * applies to trials for two years would otherwise accumulate an entry per
 * application, and nothing else ever cleans them up.
 */
export function withDismissal(
  map: DismissalMap | null | undefined,
  applicationId: string,
  now: number = Date.now(),
): DismissalMap {
  const next: DismissalMap = {}

  for (const [id, at] of Object.entries(map ?? {})) {
    if (isDismissed(map, id, now)) next[id] = at
  }

  next[applicationId] = now
  return next
}

// ── The storage edges: never throw, never assume ──────────────

export function readDismissals(): DismissalMap {
  try {
    // `window.localStorage` itself throws where site data is blocked, so the
    // property access belongs inside the try, not before it.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    return parsed as DismissalMap
  } catch {
    // Private window, blocked storage, or something else wrote junk here.
    // "Nothing is dismissed" shows the prompt, which is the safe direction.
    return {}
  }
}

export function writeDismissal(applicationId: string, now: number = Date.now()) {
  try {
    const next = withDismissal(readDismissals(), applicationId, now)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The dismissal is lost and the prompt will return. Acceptable — see the
    // module docstring. Never surface this: the player asked to hide a row,
    // not to be told about a storage quota.
  }
}
