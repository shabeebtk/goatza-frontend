import type { ReactionType } from "@/features/posts/services/posts.api"

// ── Reaction definitions ──────────────────────────────────────
// Each reaction has ONE canonical Iconify icon used everywhere
// (button + popover + stats row). No emoji suffix — keep it clean.

export interface ReactionMeta {
  type:    ReactionType
  icon:    string        // icon shown in the action button when active
  popIcon: string        // icon shown inside the popover picker
  label:   string
  color:   string
}

export const REACTIONS: ReactionMeta[] = [
  {
    type:    "like",
    icon:    "mdi:lightning-bolt",
    popIcon: "mdi:lightning-bolt",
    label:   "Like",
    color:   "var(--color-brand)",
  },
  {
    type:    "fire",
    icon:    "mdi:fire",
    popIcon: "mdi:fire",
    label:   "Fire",
    color:   "#FF5E00",
  },
  {
    type:    "respect",
    icon:    "fluent:hand-wave-24-filled",
    popIcon: "fluent:hand-wave-24-filled",
    label:   "Respect",
    color:   "#FFC83D",
  },
  {
    type:    "funny",
    icon:    "fluent:emoji-laugh-24-filled",
    popIcon: "fluent:emoji-laugh-24-filled",
    label:   "Funny",
    color:   "#FFC83D",
  },
]

export const DEFAULT_REACTION = REACTIONS[0]

/** Icon + colour by type, for the stats row's bubbles. */
export const REACTION_META: Record<string, { icon: string; color: string }> =
  Object.fromEntries(REACTIONS.map((r) => [r.type, { icon: r.icon, color: r.color }]))

/** The (up to) three most-used reactions on a post, most used first. */
export function getTopReactions(
  breakdown: Record<string, number> | undefined
): { type: string; icon: string; color: string }[] {
  if (!breakdown) return []
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type]) => ({
      type,
      ...(REACTION_META[type] ?? { icon: DEFAULT_REACTION.icon, color: DEFAULT_REACTION.color }),
    }))
}
