/**
 * Highlights — types + response schemas.
 *
 * The schemas mirror `highlights/serializers/highlight_serializers.py`. They
 * guard the SHAPE of what the API returns (so a backend change surfaces here,
 * loudly, instead of as `undefined` deep inside a component) — they are not a
 * second copy of the server's business rules.
 *
 * `visibility` and `views_count` are optional because the API strips them for
 * everyone except the rail's owner.
 */

import { z } from "zod"

/** Server rule: HighlightService.MAX_HIGHLIGHTS. */
export const MAX_HIGHLIGHTS = 10

// ── Visibility ────────────────────────────────────────────────

export const HIGHLIGHT_VISIBILITIES = [
    "everyone",
    "followers_and_recruiters",
    "recruiters_only",
] as const

export type HighlightVisibility = (typeof HIGHLIGHT_VISIBILITIES)[number]

export const DEFAULT_HIGHLIGHT_VISIBILITY: HighlightVisibility =
    "followers_and_recruiters"

// ── Highlight ─────────────────────────────────────────────────

export const highlightSchema = z.object({
    id: z.string(),
    title: z.string(),
    file_url: z.string(),
    thumbnail_url: z.string(),
    duration: z.number().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    order: z.number(),
    created_at: z.string(),

    // Owner-only — absent for every other viewer.
    visibility: z.enum(HIGHLIGHT_VISIBILITIES).optional(),
    views_count: z.number().optional(),
})

export type Highlight = z.infer<typeof highlightSchema>

// ── List response ─────────────────────────────────────────────

export const highlightsListSchema = z.object({
    count: z.number(),
    /** True when the requesting actor owns this rail (the API decides, not us). */
    is_owner: z.boolean(),
    results: z.array(highlightSchema),
})

export type HighlightsList = z.infer<typeof highlightsListSchema>

// ── Reorder response ──────────────────────────────────────────

export const highlightsReorderSchema = z.object({
    count: z.number(),
    results: z.array(highlightSchema),
})

// ── View response ─────────────────────────────────────────────

export const highlightViewSchema = z.object({
    /** False when the view wasn't counted — e.g. the owner watching their own. */
    counted: z.boolean(),
})

// ── Stats (owner only) ────────────────────────────────────────

/**
 * Two different numbers on purpose:
 *   views_count       — every play of the clip
 *   recruiter_viewers — DISTINCT recruiters, deduplicated per day server-side
 */
export const highlightStatSchema = z.object({
    id: z.string(),
    title: z.string(),
    thumbnail_url: z.string(),
    views_count: z.number(),
    recruiter_viewers: z.number(),
})

export const highlightStatsSchema = z.object({
    totals: z.object({
        highlights: z.number(),
        views: z.number(),
        recruiter_viewers: z.number(),
    }),
    results: z.array(highlightStatSchema),
})

export type HighlightStats = z.infer<typeof highlightStatsSchema>
export type HighlightStat = z.infer<typeof highlightStatSchema>
