import type { PlayerCandidate } from "../../types"

/** "2019 – 2023 · Goalkeeper". */
export function playerLine(player: PlayerCandidate): string {
  return [player.years_label, player.position].filter(Boolean).join(" · ")
}

/** Why a player can't be shown, or null when they can. */
export function cantShowReason(player: PlayerCandidate): string | null {
  if (player.can_feature) return null
  return player.is_public_profile ? "Can't be shown" : "Private profile, can't be shown"
}
