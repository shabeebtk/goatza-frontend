import type { OrgType } from "./types"

/**
 * A page's type, in words. One map for every surface that labels a page (the
 * profile's badge and share subtitle, its metadata, the chat card).
 *
 * A type this build does not know — "school", which is a "team" now, in an old
 * cached payload — has no label: the chip is left out, never shown as the raw
 * value or "undefined".
 */
const ORG_TYPE_LABELS: Record<OrgType, string> = {
  club:    "Club",
  team:    "Team",
  academy: "Academy",
}

export function orgTypeLabel(type: string | null | undefined): string {
  if (!type || !Object.prototype.hasOwnProperty.call(ORG_TYPE_LABELS, type)) return ""
  return ORG_TYPE_LABELS[type as OrgType]
}
