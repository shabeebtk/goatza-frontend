/**
 * The waitlist endpoints, called with plain `fetch`.
 *
 * Deliberately NOT the shared axios instance, for the same reason
 * `features/profile/services/publicProfile.api.ts` avoids it: that instance
 * exists to attach a JWT and the `X-Actor-*` headers from `useAuthStore`, and
 * none of that applies here. These endpoints are anonymous by design — nobody
 * signing up has an account yet, which is the entire point of the page — so
 * there is no token to send and no actor to name. Reaching for the interceptor
 * stack would only add a store read to a request that must work for a visitor
 * with no session at all.
 *
 * The two WRITE-side callers run in the BROWSER: the stats counter and the form
 * both live inside a client component. That makes `apiBase` the simpler half of
 * its counterpart — the server-side origin resolution (API_ORIGIN, siteOrigin,
 * the Vercel rewrite made absolute) exists because a relative URL is not a URL
 * during SSR, and neither of those is rendered on the server.
 *
 * `getFoundingPlayerCard` is the exception and does NOT use `apiBase`: it is
 * read by the share-card route handler, which runs on the server, where a
 * path-shaped NEXT_PUBLIC_API_URL ("/api") would throw "Failed to parse URL".
 * It goes through `fetchPublic`, which publicProfile.api.ts exports for exactly
 * this — a public surface that needs the origin resolved properly rather than a
 * fourth copy of that logic.
 */

import { fetchPublic } from "@/features/profile/services/publicProfile.api"

import type { SignupPayload, SignupResult, WaitlistStats } from "../types"

const stripSlash = (value: string) => value.replace(/\/+$/, "")

/**
 * Where to send the request from the browser.
 *
 * A path-shaped NEXT_PUBLIC_API_URL ("/api") is exactly right here: it resolves
 * against the current origin, stays same-origin, and Vercel's rewrite proxies
 * it to Django. Local dev points the same var straight at Django's absolute
 * origin; both work unchanged.
 *
 * Never emit a trailing slash. `/api` is a rewrite, and `/api/public/…/`
 * round-trips through a Vercel 308 into Django's APPEND_SLASH 301, which drops
 * the `/api` prefix and 404s — in production only, which is the worst place to
 * find out.
 */
function apiBase(): string {
  return stripSlash(process.env.NEXT_PUBLIC_API_URL ?? "")
}

/**
 * The `?src=` tag off the current URL.
 *
 * Every Instagram post links here with its own tag ("/join?src=reel_kannur_03"),
 * and it rides along on the signup so "which post actually converted" is
 * answerable in the admin rather than guessed at from timestamps.
 *
 * Read from `window.location` rather than `useSearchParams()` on purpose: the
 * hook would force this page under a Suspense boundary for no benefit, and the
 * tag is only ever needed at submit time, by which point the URL has long since
 * settled.
 */
function readSourceTag(): string {
  if (typeof window === "undefined") return ""

  const raw = new URLSearchParams(window.location.search).get("src") ?? ""

  // `source` is CharField(50) on the backend. Trimmed here too so a padded or
  // over-long tag is a shorter tag, never a 400 on somebody's signup.
  return raw.trim().slice(0, 50)
}

/**
 * A request that reached the API and came back refused.
 *
 * `fieldErrors` carries the backend's per-field map so the form can point at
 * the input that failed instead of showing one generic line at the top.
 * A thrown Error with no `JoinApiError` shape means the network never
 * completed — a different failure with a different remedy (retry), which is why
 * the two are not collapsed into one type.
 */
export class JoinApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = "JoinApiError"
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

/** The backend's error envelope: `data.errors` is `{ field: "message" }`. */
function readFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") return {}

  const errors = (data as { errors?: unknown }).errors
  if (!errors || typeof errors !== "object") return {}

  const out: Record<string, string> = {}
  for (const [field, message] of Object.entries(errors)) {
    if (typeof message === "string") out[field] = message
  }
  return out
}

// ── Stats ─────────────────────────────────────────────────────

/**
 * GET /public/waitlist/stats → the live counter behind the progress bar.
 *
 * `cache: "no-store"`: the number is the page's social proof and the whole
 * reason somebody believes the list is real. The backend already caches it for
 * a minute, so a fresh request is cheap; a stale one served out of the browser
 * cache would show a visitor a count from a previous session.
 */
export async function fetchWaitlistStats(): Promise<WaitlistStats> {
  const res = await fetch(`${apiBase()}/public/waitlist/stats`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new JoinApiError("Could not load the counter.", res.status)
  }

  const body = (await res.json()) as ApiEnvelope<WaitlistStats>

  if (!body?.success || !body.data) {
    throw new JoinApiError("Could not load the counter.", res.status)
  }

  return body.data
}

// ── Signup ────────────────────────────────────────────────────

/**
 * POST /public/waitlist/players — join the list.
 *
 * The `?src=` tag is sent BOTH on the query string and as `source` in the body.
 * The backend reads the query parameter first and falls back to the body, and
 * sending both means a proxy that strips query strings from POSTs (or a future
 * client that builds the URL differently) still attributes the signup.
 *
 * A 200 with `already_registered: true` is a SUCCESS, not an error — the phone
 * was already on the list and the caller gets the row that was already there.
 * Only a genuine refusal (400 validation, 429 throttle, 5xx) throws.
 */
export async function joinWaitlist(
  payload: SignupPayload,
): Promise<SignupResult> {
  const source = readSourceTag()

  const query = source ? `?src=${encodeURIComponent(source)}` : ""

  const body: SignupPayload = source ? { ...payload, source } : payload

  let res: Response

  try {
    res = await fetch(`${apiBase()}/public/waitlist/players${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch {
    // Never reached the server: no status, nothing to show per-field. The
    // caller turns this into a retry toast and leaves the form as typed.
    throw new Error("network")
  }

  // 429 has its own copy. The generic "check your details" line would send
  // somebody hunting for a mistake in a form that is perfectly fine.
  if (res.status === 429) {
    throw new JoinApiError(
      "Too many attempts from this connection. Try again in a little while.",
      429,
    )
  }

  let parsed: ApiEnvelope<SignupResult & { errors?: unknown }> | null = null

  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }

  if (!res.ok || !parsed?.success || !parsed.data) {
    throw new JoinApiError(
      parsed?.message || "Could not register you right now.",
      res.status,
      readFieldErrors(parsed?.data),
    )
  }

  const data = parsed.data

  return {
    signup_number: data.signup_number,
    ref_code: data.ref_code,
    name: data.name,
    district: data.district ?? "",
    // Defaulted rather than required: an older backend that does not send the
    // flag should render the ordinary "you're in" screen, not crash on it.
    already_registered: data.already_registered === true,
  }
}

// ── Share card (server-side) ──────────────────────────────────

/** The five fields GET /public/waitlist/players/<ref> publishes. Phone, email
 *  and Instagram are NOT in the backend's serializer, so they cannot arrive
 *  here even by mistake — a ref code is a short public string. */
export type FoundingPlayerSignup = {
  name: string
  signup_number: number
  district: string
  position: string
  sport: string
}

/**
 * One signup by its public ref code, or null.
 *
 * Null collapses "no such code" and "the API is unreachable" into one answer,
 * the same way `getPublicUserProfile` does: the card route can act on neither,
 * and both mean there is no card to draw.
 */
export async function getFoundingPlayerCard(
  ref: string,
): Promise<FoundingPlayerSignup | null> {
  const result = await fetchPublic<FoundingPlayerSignup>(
    `/public/waitlist/players/${encodeURIComponent(ref)}`,
  )

  return result.status === "ok" ? result.data : null
}
