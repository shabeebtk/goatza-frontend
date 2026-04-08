/**
 * mapbox.service.ts
 *
 * Wraps Mapbox Geocoding API v5 (forward geocoding) for city search.
 * Uses the REST API directly — no SDK needed for this simple use case,
 * which keeps the bundle smaller.
 *
 * Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
 */

export type MapboxCity = {
    /** Display label e.g. "Kannur, Kerala, India" */
    label: string
    /** Short city name */
    name: string
    /** State / region name */
    state: string
    /** ISO 3166-1 alpha-2 country code e.g. "IN" */
    country_code: string
    latitude: number
    longitude: number
    /**
     * Mapbox place id — used as external_id.
     * Format: "place.{id}" from the Mapbox feature id.
     */
    external_id: string
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""
const BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"

/**
 * Search for cities matching the query string.
 * Returns up to 6 results, filtered to place-type "place" (cities).
 */
export async function searchCities(query: string): Promise<MapboxCity[]> {
    if (!query || query.trim().length < 2) return []

    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        types: "poi,place,locality,neighborhood",
        language: "en",
        limit: "6",
        fuzzyMatch: "true",
        autocomplete: "true",
    })

    const url = `${BASE_URL}/${encodeURIComponent(query.trim())}.json?${params}`

    const res = await fetch(url)
    if (!res.ok) throw new Error("Mapbox geocoding request failed")

    const data = await res.json()

    return (data.features ?? []).map((f: MapboxFeature) => mapFeatureToCity(f))
}

// ── Internal Mapbox types ─────────────────────────────────────

type MapboxContext = {
    id: string
    text: string
    short_code?: string
}

type MapboxFeature = {
    id: string
    text: string
    place_name: string
    center: [number, number]   // [lng, lat]
    context?: MapboxContext[]
}

function mapFeatureToCity(f: MapboxFeature): MapboxCity {
    const ctx = f.context ?? []

    // Extract region (state) and country from context
    const regionCtx = ctx.find(c => c.id.startsWith("region."))
    const countryCtx = ctx.find(c => c.id.startsWith("country."))

    const name = f.text
    const state = regionCtx?.text ?? ""
    const country_code = (countryCtx?.short_code ?? "").toUpperCase()
    const [lng, lat] = f.center

    // Build a clean label: "City, State, Country"
    const parts = [name, state, countryCtx?.text].filter(Boolean)
    const label = parts.join(", ")

    return {
        label,
        name,
        state,
        country_code,
        latitude: lat,
        longitude: lng,
        external_id: f.id,
    }
}







// map place 

export type MapboxPlace = {
    label: string
    name: string
    place_type: string
    state: string
    country_code: string
    latitude: number
    longitude: number
    external_id: string
}

export async function searchPlaces(query: string): Promise<MapboxPlace[]> {
    if (!query || query.trim().length < 2) return []

    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        types: "poi,place,region,district,locality",
        language: "en",
        limit: "6",
        fuzzyMatch: "true",
    })

    const url = `${BASE_URL}/${encodeURIComponent(query.trim())}.json?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("Mapbox geocoding request failed")

    const data = await res.json()
    return (data.features ?? []).map((f: MapboxFeature) => mapFeatureToPlace(f))
}

function mapFeatureToPlace(f: MapboxFeature): MapboxPlace {
    const ctx = f.context ?? []
    const regionCtx = ctx.find(c => c.id.startsWith("region."))
    const countryCtx = ctx.find(c => c.id.startsWith("country."))
    const placeCtx = ctx.find(c => c.id.startsWith("place."))
    const [lng, lat] = f.center

    const parts = [f.text, placeCtx?.text ?? regionCtx?.text, countryCtx?.text].filter(Boolean)

    return {
        label: parts.join(", "),
        name: f.text,
        place_type: f.id.split(".")[0] ?? "place",
        state: regionCtx?.text ?? "",
        country_code: (countryCtx?.short_code ?? "").toUpperCase(),
        latitude: lat,
        longitude: lng,
        external_id: f.id,
    }
}