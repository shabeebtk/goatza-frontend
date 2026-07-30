/**
 * UI copy for the three visibility levels — the ONLY place these strings live.
 *
 * `explanation` is the one-line description the manage screen's segmented
 * control shows (HIGHLIGHTS_SPEC.md §3); the viewer shows `label` in the
 * owner-only badge.
 */

import type { HighlightVisibility } from "./types"

export type VisibilityMeta = {
    label: string
    explanation: string
    icon: string
}

export const VISIBILITY_META: Record<HighlightVisibility, VisibilityMeta> = {
    everyone: {
        label: "Everyone",
        explanation: "Anyone on Goatza can watch this clip.",
        icon: "mdi:earth",
    },
    followers_and_recruiters: {
        label: "Followers & recruiters",
        explanation: "Your followers, plus scouts, coaches and clubs.",
        icon: "mdi:account-group-outline",
    },
    recruiters_only: {
        label: "Recruiters only",
        explanation: "Only scouts, coaches and clubs — not your followers.",
        icon: "mdi:shield-account-outline",
    },
}

/** mm:ss for the tile badge. "" when the duration is unknown. */
export function formatClipDuration(seconds: number | null): string {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return ""
    const total = Math.round(seconds)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}
