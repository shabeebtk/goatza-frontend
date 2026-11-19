/**
 * An org's level, in words and as an icon: the profile's badge and the page's
 * key facts. A level this build does not know has no label.
 */

export const LEVEL_LABELS: Record<string, string> = {
  amateur: "Amateur",
  semi_professional: "Semi-Pro",
  professional: "Professional",
  youth: "Youth",
}

export const LEVEL_ICONS: Record<string, string> = {
  amateur: "mdi:medal-outline",
  semi_professional: "mdi:medal",
  professional: "mdi:trophy-outline",
  youth: "mdi:account-school-outline",
}
