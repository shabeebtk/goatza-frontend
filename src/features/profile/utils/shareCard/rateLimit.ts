/**
 * Per-IP rate limit for the card renderer.
 *
 * The route is unauthenticated, CPU-heavy and produces a ~500KB PNG — a
 * straightforward amplification target. Two things bound it and they do
 * different jobs: the slot allowlist caps how many DISTINCT images exist (so a
 * flood of varied URLs still lands on a small set of cached responses), and
 * this caps the RATE at which one caller can force cache misses.
 *
 * In-memory and therefore per-instance: on a serverless platform a determined
 * attacker spread across instances gets a multiple of this budget. That is the
 * honest limitation — the fix would be a shared store, which is a dependency
 * this feature does not otherwise need. What it does reliably is stop one
 * client pinning one instance, which is the failure mode that takes the route
 * down for everybody else on it.
 *
 * Deliberately does not run on cache hits: the CDN serves those and never
 * reaches this code, so the budget is spent on renders, not on requests.
 */

const WINDOW_MS = 60_000
const MAX_RENDERS_PER_WINDOW = 30

/** Bounded so a spray of spoofed X-Forwarded-For values cannot grow the map
 *  without limit — that would turn the rate limiter into the memory leak it
 *  exists to prevent. */
const MAX_TRACKED_CLIENTS = 10_000

const hits = new Map<string, number[]>()

/**
 * The caller's IP as the platform reports it.
 *
 * `x-forwarded-for` is client-controlled in general, but on Vercel the edge
 * rewrites it and the left-most entry is the real client. Anything unresolvable
 * shares one bucket, which is the conservative direction: unknown callers are
 * limited together rather than each getting a fresh budget.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]!.trim()

  return headers.get("x-real-ip")?.trim() || "unknown"
}

function sweep(now: number) {
  for (const [key, stamps] of hits) {
    const live = stamps.filter((t) => now - t < WINDOW_MS)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
}

/** True when the caller is within budget. Records the hit as a side effect. */
export function allowRender(key: string, now = Date.now()): boolean {
  if (hits.size > MAX_TRACKED_CLIENTS) sweep(now)

  const stamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)

  if (stamps.length >= MAX_RENDERS_PER_WINDOW) {
    hits.set(key, stamps)
    return false
  }

  stamps.push(now)
  hits.set(key, stamps)
  return true
}

/** How long a throttled caller should wait, for the Retry-After header. */
export const RETRY_AFTER_SECONDS = WINDOW_MS / 1000

/** Test seam — the module-level map would otherwise leak between cases. */
export function resetRateLimit() {
  hits.clear()
}
