/**
 * places.service.ts
 *
 * Place search for the whole app. Replaces the previous geocoding service.
 *
 * ── The one rule ──────────────────────────────────────────────
 *
 * There is no API key in this file, and there must never be one. Every call
 * goes to OUR backend (`/places/*`), which holds the Google key server-side and
 * is the only thing that talks to Google — see docs/PLACES_MIGRATION.md
 * decision 2. That is also why this goes through the shared axios client: JWT
 * and actor headers ride along when somebody is signed in, and the anonymous
 * /join page works because the backend allows anonymous callers on these two
 * endpoints (with tighter per-IP throttles).
 *
 * ── Paths have NO trailing slash ──────────────────────────────
 *
 * Section 4 of the doc writes these as `/places/autocomplete/`, but the backend
 * deliberately registers them slash-less (see places/urls.py). In production
 * the browser calls `/api/places/...`, Vercel 308s a trailing slash away BEFORE
 * rewriting, and a Django APPEND_SLASH redirect at that point would answer with
 * a path that has lost the `/api` prefix — resolving against the frontend
 * origin and landing on the Next 404. Local dev accepts either form, so nothing
 * catches this before deploy. Do not add slashes here.
 *
 * ── Two calls, one session ────────────────────────────────────
 *
 * A search is billed as ONE session when every autocomplete request and the
 * single details request carry the same v4 UUID. The pickers own that token:
 * they mint one per open picker and regenerate it after a select, a clear or a
 * close. This module never invents one on its own — a token created per request
 * would turn one billed session into one billed event per keystroke.
 */

import api from "@/core/api/axios"

// ── Types ─────────────────────────────────────────────────────

/** Which picker is asking. Also the `type` stored on the Location row. */
export type PlaceType = "city" | "place"

/**
 * One autocomplete prediction.
 *
 * This is ALL that comes back from a search — no coordinates, and that is not
 * an oversight. Coordinates cost a Place Details call, which is only ever made
 * for the single prediction the user actually picks (doc section 3 rule 4).
 */
export type PlaceSuggestion = {
    /** Google place_id. Stored permanently as `external_id`. */
    place_id: string
    /** Short name, e.g. "Kannur" — the prediction's mainText. */
    name: string
    /** Full one-line label, e.g. "Kannur, Kerala, India". */
    label: string
    /** The remainder under the name, e.g. "Kerala, India". */
    secondary: string
    /** Google place types, e.g. ["locality", "political"]. */
    types: string[]
}

/** What GET /places/details/<place_id> answers with (doc section 4.2). */
export type PlaceDetails = {
    place_id: string
    latitude: number | null
    longitude: number | null
    city: string
    state: string
    country: string
    country_code: string
    types: string[]
}

/**
 * A fully resolved place — a prediction plus its details, and the single type
 * every location call site in the app passes around. Replaces the two separate
 * city and place types that preceded it.
 *
 * The first block of fields is deliberately named exactly as the old provider
 * types named them, because every consumer already reads them:
 *
 *   label        the full label the user saw and picked
 *   name         the short name
 *   state / country_code / latitude / longitude
 *   external_id  now the Google place_id (was the old provider's feature id)
 *
 * `latitude`/`longitude` are numbers rather than `number | null` because a
 * PlaceResult is only ever built from a details response that HAD coordinates —
 * `toPlaceResult` refuses to build one otherwise. Nullable coordinates are a
 * server-side concern (an expired Location row), not something a picker
 * produces.
 */
export type PlaceResult = {
    /** Always "google" here. The backend also accepts "manual". */
    provider: "google"
    /** Which picker produced this — becomes `type` on the stored Location. */
    place_type: PlaceType

    label: string
    name: string
    city: string
    state: string
    country: string
    country_code: string
    latitude: number
    longitude: number
    /** The Google place_id. */
    external_id: string

    /** Google's raw types, kept for choosing an icon. */
    types: string[]
}

/** Optional 50 km bias centre — the actor's own coordinates. */
export type PlaceBias = {
    latitude: number
    longitude: number
}

/** Per-call knobs that are not part of the provider contract's shape. */
export type PlaceRequestOptions = {
    /** Aborts the in-flight request when the query moves on. */
    signal?: AbortSignal
}

// ── Provider interface ────────────────────────────────────────

/**
 * The seam. Everything in the app depends on this, not on Google.
 *
 * It exists because the last provider swap touched eleven files: the pickers
 * import the interface and the default instance, so a second implementation
 * (or a fake, in a test) is a one-line change here rather than a rename across
 * the codebase.
 */
export interface PlaceSearchProvider {
    /** Cities/towns only. Backed by `mode=city`. */
    searchCities(
        query: string,
        sessionToken: string,
        bias?: PlaceBias | null,
        options?: PlaceRequestOptions,
    ): Promise<PlaceSuggestion[]>

    /** Everything — grounds, turfs, academies, stadiums. `mode=place`. */
    searchPlaces(
        query: string,
        sessionToken: string,
        bias?: PlaceBias | null,
        options?: PlaceRequestOptions,
    ): Promise<PlaceSuggestion[]>

    /** The ONE call made for the ONE prediction the user selected. */
    getPlaceDetails(
        placeId: string,
        sessionToken: string,
        options?: PlaceRequestOptions,
    ): Promise<PlaceDetails>
}

// ── Session tokens ────────────────────────────────────────────

/**
 * A fresh v4 UUID for one search session.
 *
 * The backend rejects anything that is not v4, so the fallback matters: Safari
 * only shipped `crypto.randomUUID` in 15.4 and it is unavailable on any
 * non-HTTPS origin that is not localhost. The fallback fills the version and
 * variant nibbles by hand so what it produces is a real v4, not a
 * v4-shaped string.
 */
export function newSessionToken(): string {
    const cryptoObj = globalThis.crypto

    if (typeof cryptoObj?.randomUUID === "function") {
        return cryptoObj.randomUUID()
    }

    const bytes = new Uint8Array(16)

    if (typeof cryptoObj?.getRandomValues === "function") {
        cryptoObj.getRandomValues(bytes)
    } else {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256)
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join("-")
}

// ── Errors ────────────────────────────────────────────────────

/**
 * Search is off right now — the daily cap is spent, Google is throttling us, or
 * no key is configured. The backend answers 503 `search_unavailable` for all
 * three because they mean the same thing to a picker: stop asking, and say so.
 *
 * Separate from a generic failure so the UI can offer "try again later" rather
 * than a Retry button that will fail identically.
 */
export class PlaceSearchUnavailableError extends Error {
    constructor(message = "Place search is unavailable right now.") {
        super(message)
        this.name = "PlaceSearchUnavailableError"
    }
}

/** Any other failure: a 502 from Google, a network drop, a bad response. */
export class PlaceSearchError extends Error {
    constructor(message = "Place search failed.") {
        super(message)
        this.name = "PlaceSearchError"
    }
}

/** True for an axios cancellation, which callers must swallow silently. */
export function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") return true

    const code = (error as { code?: string } | null)?.code
    const name = (error as { name?: string } | null)?.name

    return code === "ERR_CANCELED" || name === "CanceledError"
}

function translate(error: unknown): Error {
    const status = (error as { response?: { status?: number } } | null)
        ?.response?.status

    if (status === 503) return new PlaceSearchUnavailableError()

    return new PlaceSearchError()
}

// ── Google implementation ─────────────────────────────────────

const AUTOCOMPLETE_PATH = "/places/autocomplete"
const DETAILS_PATH = "/places/details"

/**
 * The app-wide response envelope every Goatza endpoint answers with
 * (`utils/response.py`): `{ success, message, data }`.
 *
 * Section 4 of the migration doc writes the two places responses BARE
 * (`{"results": [...]}`), but the views go through `response_data()` like
 * everything else, so the real payload sits one level down under `data`. This
 * is the same `res.data.data` unwrap every other service in the app does — and
 * reading it one level too shallow is silent: `results` comes back undefined,
 * the `?? []` turns it into an empty list, and the picker says "No places
 * found" for a request that actually succeeded.
 */
type Envelope<T> = {
    success?: boolean
    message?: string
    data?: T
}

async function autocomplete(
    mode: PlaceType,
    query: string,
    sessionToken: string,
    bias?: PlaceBias | null,
    options?: PlaceRequestOptions,
): Promise<PlaceSuggestion[]> {
    const params: Record<string, string | number> = {
        q: query.trim(),
        session: sessionToken,
        mode,
    }

    // Both or neither — the backend 400s on half a pair.
    if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
        params.lat = bias.latitude
        params.lng = bias.longitude
    }

    try {
        const res = await api.get<Envelope<{ results?: PlaceSuggestion[] }>>(
            AUTOCOMPLETE_PATH,
            { params, signal: options?.signal },
        )

        return res.data?.data?.results ?? []
    } catch (error) {
        if (isAbortError(error)) throw error
        throw translate(error)
    }
}

export class GooglePlacesProvider implements PlaceSearchProvider {
    searchCities(
        query: string,
        sessionToken: string,
        bias?: PlaceBias | null,
        options?: PlaceRequestOptions,
    ): Promise<PlaceSuggestion[]> {
        return autocomplete("city", query, sessionToken, bias, options)
    }

    searchPlaces(
        query: string,
        sessionToken: string,
        bias?: PlaceBias | null,
        options?: PlaceRequestOptions,
    ): Promise<PlaceSuggestion[]> {
        return autocomplete("place", query, sessionToken, bias, options)
    }

    async getPlaceDetails(
        placeId: string,
        sessionToken: string,
        options?: PlaceRequestOptions,
    ): Promise<PlaceDetails> {
        try {
            const res = await api.get<Envelope<PlaceDetails>>(
                `${DETAILS_PATH}/${encodeURIComponent(placeId)}`,
                { params: { session: sessionToken }, signal: options?.signal },
            )

            const details = res.data?.data

            if (!details) {
                // A 200 with no payload. Not something a picker can use, and
                // not something to store half of.
                throw new PlaceSearchError()
            }

            return details
        } catch (error) {
            if (isAbortError(error)) throw error
            throw translate(error)
        }
    }
}

/** The instance every picker uses. */
export const placesProvider: PlaceSearchProvider = new GooglePlacesProvider()

// ── Merging a selection ───────────────────────────────────────

/**
 * Prediction + details → the PlaceResult the rest of the app stores.
 *
 * The LABEL AND NAME COME FROM THE PREDICTION, never from details. That is a
 * pricing rule, not a preference: `displayName` would move Place Details from
 * the Essentials SKU to Pro, so the details field mask does not request it and
 * the prediction is the only thing that knows what the user actually read
 * before clicking (doc section 3 rule 1).
 *
 * Returns null when details came back without coordinates. A place with no
 * point is not something a picker should hand to a form — the caller shows the
 * list again with an error rather than storing half a location.
 */
export function toPlaceResult(
    suggestion: PlaceSuggestion,
    details: PlaceDetails,
    placeType: PlaceType,
): PlaceResult | null {
    if (
        details.latitude == null ||
        details.longitude == null ||
        !Number.isFinite(details.latitude) ||
        !Number.isFinite(details.longitude)
    ) {
        return null
    }

    return {
        provider: "google",
        place_type: placeType,

        label: suggestion.label || suggestion.name,
        name: suggestion.name || suggestion.label,
        city: details.city || "",
        state: details.state || "",
        country: details.country || "",
        country_code: (details.country_code || "").toUpperCase(),
        latitude: details.latitude,
        longitude: details.longitude,
        external_id: suggestion.place_id,

        types: details.types?.length ? details.types : suggestion.types ?? [],
    }
}

// ── Payload ───────────────────────────────────────────────────

/**
 * The `location` object every write endpoint accepts
 * (docs/PLACES_MIGRATION.md 5.4).
 *
 * `name` is the FULL label and `city` is the short one — the same rename the
 * waitlist's `toSignupLocation` has always done, now in one place so the
 * recruitment, post, profile and org payloads cannot each get it slightly
 * different.
 */
export type LocationPayload = {
    provider: "google"
    external_id: string
    name: string
    type: PlaceType
    city: string
    state: string
    country: string
    country_code: string
    latitude: number
    longitude: number
}

/** PlaceResult → the section 5.4 payload. */
export function toLocationPayload(place: PlaceResult): LocationPayload {
    return {
        provider: place.provider,
        external_id: place.external_id,
        name: place.label,
        type: place.place_type,
        city: place.city || place.name,
        state: place.state,
        country: place.country,
        country_code: place.country_code,
        latitude: place.latitude,
        longitude: place.longitude,
    }
}
