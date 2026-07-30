/**
 * Highlights API (backend: /highlights/).
 *
 * Uses the shared axios instance, so every call already carries the JWT and the
 * active actor headers. Responses are unwrapped from the standard envelope
 * (`res.data.data`) and parsed through the feature schemas.
 */

import { z } from "zod"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
    highlightSchema,
    highlightStatsSchema,
    highlightViewSchema,
    highlightsListSchema,
    highlightsReorderSchema,
    type Highlight,
    type HighlightStats,
    type HighlightVisibility,
    type HighlightsList,
} from "../types"

const BASE = "/highlights"

// ── Payloads ──────────────────────────────────────────────────

/** Direct upload — the file went straight to Cloudinary and never was a post. */
export type CreateHighlightDirectPayload = {
    file_url: string
    public_id: string
    thumbnail_url?: string
    duration?: number
    width?: number
    height?: number
    title?: string
    visibility?: HighlightVisibility
}

/** Promote — copy the media of one of the player's own video posts. */
export type CreateHighlightPromotePayload = {
    source_media_id: string
    title?: string
    visibility?: HighlightVisibility
}

export type CreateHighlightPayload =
    | CreateHighlightDirectPayload
    | CreateHighlightPromotePayload

export type UpdateHighlightPayload = {
    title?: string
    visibility?: HighlightVisibility
}

// ── Calls ─────────────────────────────────────────────────────

export const createHighlightApi = async (
    payload: CreateHighlightPayload
): Promise<Highlight> => {
    const res = await api.post(`${BASE}/create`, payload)
    return highlightSchema.parse(res.data.data)
}

export const fetchHighlightsByUsernameApi = async (
    username: string
): Promise<HighlightsList> => {
    const res = await api.get(`${BASE}/user/${encodeURIComponent(username)}`)
    return highlightsListSchema.parse(res.data.data)
}

export const updateHighlightApi = async (
    highlightId: string,
    payload: UpdateHighlightPayload
): Promise<Highlight> => {
    const res = await api.patch(`${BASE}/${highlightId}`, payload)
    return highlightSchema.parse(res.data.data)
}

/**
 * Send the WHOLE rail in its new order — the server rejects a partial list, so
 * there is no way to half-apply a drag.
 */
export const reorderHighlightsApi = async (
    orderedIds: string[]
): Promise<Highlight[]> => {
    const res = await api.put(`${BASE}/reorder`, { ordered_ids: orderedIds })
    return highlightsReorderSchema.parse(res.data.data).results
}

export const removeHighlightApi = async (highlightId: string): Promise<void> => {
    await api.delete(`${BASE}/${highlightId}`)
}

/**
 * Fire-and-forget view counter. Resolves to whether the server counted it
 * (the owner's own views never are).
 */
export const recordHighlightViewApi = async (
    highlightId: string
): Promise<boolean> => {
    const res = await api.post(`${BASE}/${highlightId}/view`, {})
    return highlightViewSchema.parse(res.data.data).counted
}

/**
 * The signed-in player's own reel analytics. Self-scoped server-side — there is
 * no way to ask for anyone else's numbers.
 */
export const fetchHighlightStatsApi = async (): Promise<HighlightStats> => {
    const res = await api.get(`${BASE}/stats`)
    return highlightStatsSchema.parse(res.data.data)
}

// ── Error copy ────────────────────────────────────────────────

/**
 * The backend already writes human error messages ("You already have 10
 * highlights…", "Only videos can be added to highlights."), so this passes them
 * through and only supplies a highlights-flavoured fallback.
 *
 * Two things are deliberately NEVER shown to a player:
 *   - axios's own "Request failed with status code 404" (getApiErrorMessage
 *     already refuses to return it — a bare 404 means our routing is wrong,
 *     which is not something the player can act on)
 *   - a Zod parse failure, whose message is a multi-line JSON dump. A response
 *     that doesn't match the schema is a wiring bug; the player gets the
 *     fallback and we keep the detail in the console.
 */
export const getHighlightErrorMessage = (
    err: unknown,
    fallback = "Something went wrong with your highlights. Please try again."
): string => {
    if (err instanceof z.ZodError) return fallback
    return getApiErrorMessage(err, fallback)
}

/**
 * True when a create failed because the player is at the 10-clip cap. Callers
 * use it to point at the manage screen instead of offering a pointless retry.
 */
export const isHighlightCapError = (err: unknown): boolean =>
    /already have \d+ highlights/i.test(getApiErrorMessage(err, ""))
