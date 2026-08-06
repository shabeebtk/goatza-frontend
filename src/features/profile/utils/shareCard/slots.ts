/**
 * Which three details end up on a player's card.
 *
 * The catalog is half fixed and half dynamic. The fixed half is the six
 * measurables every player has a column for; the dynamic half is the player's
 * own values for their PRIMARY sport's attributes, which is why "Preferred
 * foot" shows up for a footballer and "Batting style" for a cricketer without a
 * line of code here knowing either exists. Sports are data on this platform,
 * and the card inherits that for free.
 *
 * Everything in this file is pure and takes the profile as an argument — no
 * fetching, no React. The route validates a query param through it and the
 * picker builds its rows from the same catalog, so the two can never disagree
 * about what a player is allowed to put on their own card.
 */

import type { PublicUserProfile } from "@/features/profile/services/publicProfile.api"
import type { SlotCandidate } from "./types"

/** Exactly three render. Never two, never four. */
export const SLOT_COUNT = 3

/** Dynamic keys are namespaced so a sport attribute called "Height" cannot
 *  collide with the fixed slot of the same name. */
export const ATTRIBUTE_KEY_PREFIX = "attr:"

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  professional: "Professional",
}

/**
 * The order slots are offered in and, minus `weight`, the order they backfill
 * in.
 *
 * `weight` sits in the middle of the picker but is absent from the default set
 * below. It is the measurable most likely to make a young athlete
 * uncomfortable and the least informative at a glance, so it is offered and
 * never assumed.
 */
const PICKER_ORDER = [
  "height",
  ATTRIBUTE_KEY_PREFIX,
  "city",
  "weight",
  "experience",
  "age_group",
  "joined",
] as const

/**
 * What fills the slots when nobody has chosen: the player's height, their
 * sport's first attribute, and where they are based. Also what the link
 * preview always uses — the crawler fetches that one, not the player, so it
 * cannot reflect a choice nobody made.
 */
const DEFAULT_ORDER = [
  "height",
  ATTRIBUTE_KEY_PREFIX,
  "city",
  "experience",
  "age_group",
  "joined",
] as const

/** "Preferred foot" → "attr:preferred-foot". Stable across renders because it
 *  is derived from the attribute name, which is what the player sees. */
export function attributeKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks so "Préféré" and "Prefere" slug the same.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return `${ATTRIBUTE_KEY_PREFIX}${slug}`
}

function fixedCandidates(profile: PublicUserProfile): SlotCandidate[] {
  const out: SlotCandidate[] = []

  if (profile.height_cm) {
    out.push({ key: "height", label: "Height", value: `${profile.height_cm} cm` })
  }

  if (profile.weight_kg) {
    // Rounded: a card is a glance, and "68.50 kg" reads like a medical record.
    out.push({ key: "weight", label: "Weight", value: `${Math.round(profile.weight_kg)} kg` })
  }

  if (profile.location?.city) {
    out.push({ key: "city", label: "Based in", value: profile.location.city })
  }

  const level = profile.primary_sport?.experience_level
  if (level) {
    out.push({ key: "experience", label: "Level", value: LEVEL_LABELS[level] ?? level })
  }

  if (profile.age_group) {
    out.push({ key: "age_group", label: "Age group", value: profile.age_group })
  }

  const joinedYear = profile.created_at?.slice(0, 4)
  if (joinedYear && /^\d{4}$/.test(joinedYear)) {
    out.push({ key: "joined", label: "On Goatza since", value: joinedYear })
  }

  return out
}

/**
 * The player's primary-sport attributes, already filtered server-side to
 * `select` / `boolean` / `number` with a non-empty value — free text is
 * arbitrarily long and multi-select is comma soup, and a slot is sized for two
 * words.
 */
function attributeCandidates(profile: PublicUserProfile): SlotCandidate[] {
  const attributes = profile.primary_sport?.attributes ?? []

  return attributes.map((attribute) => ({
    key: attributeKey(attribute.name),
    label: attribute.name,
    value: formatAttributeValue(attribute.data_type, attribute.value),
  }))
}

function formatAttributeValue(dataType: string, value: string): string {
  if (dataType !== "boolean") return value

  // Booleans arrive as whatever the option or text column held. "Yes"/"No"
  // is the only reading that makes sense in a slot labelled with the
  // attribute's own name ("Left footed: Yes").
  return /^(true|yes|1)$/i.test(value.trim()) ? "Yes" : "No"
}

/**
 * Everything this player could put on their card, in picker order.
 *
 * A field the player has not filled in never appears — the picker offers what
 * exists, so there is no way to select an empty slot.
 */
export function buildSlotCatalog(profile: PublicUserProfile): SlotCandidate[] {
  const all = [...fixedCandidates(profile), ...attributeCandidates(profile)]
  const byKey = new Map(all.map((candidate) => [candidate.key, candidate]))

  const ordered: SlotCandidate[] = []

  for (const slot of PICKER_ORDER) {
    if (slot === ATTRIBUTE_KEY_PREFIX) {
      // The placeholder expands to every attribute, in the display_order the
      // backend already sorted them into.
      for (const candidate of all) {
        if (candidate.key.startsWith(ATTRIBUTE_KEY_PREFIX)) ordered.push(candidate)
      }
      continue
    }

    const candidate = byKey.get(slot)
    if (candidate) ordered.push(candidate)
  }

  return ordered
}

/** The keys the default order fills, capped at three. Used for the link
 *  preview and as the picker's initial state. */
export function defaultSlotKeys(catalog: SlotCandidate[]): string[] {
  const keys: string[] = []

  for (const slot of DEFAULT_ORDER) {
    if (keys.length >= SLOT_COUNT) break

    if (slot === ATTRIBUTE_KEY_PREFIX) {
      // Just the first attribute. A player with five of them should not have
      // their whole card taken over by one sport's minutiae.
      const first = catalog.find((c) => c.key.startsWith(ATTRIBUTE_KEY_PREFIX))
      if (first) keys.push(first.key)
      continue
    }

    if (catalog.some((c) => c.key === slot)) keys.push(slot)
  }

  return keys
}

/**
 * Turn a `?slots=` param into the three candidates that will render.
 *
 * Nothing here is an error. An unknown key, a key for a field this player has
 * not filled in, a fourth key, a repeat — each is dropped and the gap is
 * backfilled from the default order. A card is a shareable artifact reached by
 * URL, and a 400 on a hand-edited query string would mean a broken image in
 * somebody's chat rather than a slightly different card.
 */
export function resolveSlots(
  catalog: SlotCandidate[],
  requested: string | null | undefined
): SlotCandidate[] {
  const byKey = new Map(catalog.map((candidate) => [candidate.key, candidate]))
  const chosen: string[] = []

  for (const raw of parseSlotParam(requested)) {
    if (chosen.length >= SLOT_COUNT) break
    if (!byKey.has(raw) || chosen.includes(raw)) continue
    chosen.push(raw)
  }

  for (const key of defaultSlotKeys(catalog)) {
    if (chosen.length >= SLOT_COUNT) break
    if (!chosen.includes(key)) chosen.push(key)
  }

  // Still short? Then the player genuinely has fewer than three fields filled
  // in. Render what they have and let the row breathe — inventing filler is
  // worse than a two-item row.
  for (const candidate of catalog) {
    if (chosen.length >= SLOT_COUNT) break
    if (!chosen.includes(candidate.key)) chosen.push(candidate.key)
  }

  // Rendered in catalog order, NOT in the order they were asked for. This is
  // what makes the sorted cache key in `canonicalSlotKey` correct: two params
  // naming the same three fields must produce the same bytes, or they would be
  // sharing a cache entry while wanting different images.
  return catalog.filter((candidate) => chosen.includes(candidate.key))
}

/** Split and tidy the raw param. Empty segments and whitespace are noise, not
 *  input. */
export function parseSlotParam(requested: string | null | undefined): string[] {
  if (!requested) return []

  return requested
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * The slot list as it appears in a cache key.
 *
 * Sorted, so `height,foot,city` and `city,foot,height` are one cached variant
 * rather than two. The rendered card is identical either way — the layout puts
 * them in the order `resolveSlots` returned, which is derived from the same
 * set — so caching them separately would only halve the hit rate.
 */
export function canonicalSlotKey(keys: string[]): string {
  return [...new Set(keys)].sort().join(",")
}
