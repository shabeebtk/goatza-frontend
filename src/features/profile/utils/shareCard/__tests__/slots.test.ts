/**
 * Slot validation.
 *
 * Everything a `?slots=` param can be wrong in, and what each one must
 * degrade to. A card is reached by URL and travels through chat apps, so the
 * governing rule is that nothing here is ever an error — a hand-edited query
 * string produces a slightly different card, never a broken image.
 */

import { describe, expect, it } from "vitest"

import {
  ATTRIBUTE_KEY_PREFIX,
  SLOT_COUNT,
  attributeKey,
  buildSlotCatalog,
  canonicalSlotKey,
  defaultSlotKeys,
  resolveSlots,
} from "../slots"
import { profile } from "./fixtures"

const keysOf = (candidates: { key: string }[]) => candidates.map((c) => c.key)
const FOOT = attributeKey("Preferred foot")

describe("the catalog", () => {
  it("offers every field the player has filled in, in picker order", () => {
    expect(keysOf(buildSlotCatalog(profile()))).toEqual([
      "height",
      FOOT,
      "city",
      "weight",
      "experience",
      "age_group",
      "joined",
    ])
  })

  it("omits fields the player has not filled in", () => {
    const catalog = buildSlotCatalog(
      profile({ height_cm: null, weight_kg: null, location: null })
    )

    expect(keysOf(catalog)).not.toContain("height")
    expect(keysOf(catalog)).not.toContain("weight")
    expect(keysOf(catalog)).not.toContain("city")
  })

  it("formats values in natural case — the card uppercases them itself", () => {
    const catalog = buildSlotCatalog(profile())
    const byKey = new Map(catalog.map((c) => [c.key, c]))

    expect(byKey.get("height")).toMatchObject({ label: "Height", value: "178 cm" })
    expect(byKey.get("city")).toMatchObject({ label: "Based in", value: "Kozhikode" })
    expect(byKey.get("experience")).toMatchObject({ label: "Level", value: "Advanced" })
    expect(byKey.get("joined")).toMatchObject({ label: "On Goatza since", value: "2025" })
  })

  it("rounds weight rather than printing a decimal", () => {
    const catalog = buildSlotCatalog(profile({ weight_kg: 68.5 }))
    expect(catalog.find((c) => c.key === "weight")?.value).toBe("69 kg")
  })
})

describe("dynamic sport attributes", () => {
  it("includes a select attribute as a candidate", () => {
    const catalog = buildSlotCatalog(profile())
    const foot = catalog.find((c) => c.key === FOOT)

    expect(foot).toMatchObject({ label: "Preferred foot", value: "Right" })
  })

  it("never sees a text attribute — the backend filters those out entirely", () => {
    // The narrowing is server-side (free text destroys a fixed-width slot), so
    // what this pins is that nothing here re-widens it: an attribute that did
    // arrive is trusted, and the payload type has no `text` member.
    const withoutAttributes = buildSlotCatalog(
      profile({
        primary_sport: { ...profile().primary_sport!, attributes: [] },
      })
    )

    expect(keysOf(withoutAttributes).some((k) => k.startsWith(ATTRIBUTE_KEY_PREFIX))).toBe(
      false
    )
  })

  it("renders a boolean as Yes / No", () => {
    const catalog = buildSlotCatalog(
      profile({
        primary_sport: {
          ...profile().primary_sport!,
          attributes: [{ name: "Left footed", data_type: "boolean", value: "true" }],
        },
      })
    )

    expect(catalog.find((c) => c.key === attributeKey("Left footed"))?.value).toBe("Yes")
  })

  it("namespaces attribute keys so one cannot collide with a fixed slot", () => {
    const catalog = buildSlotCatalog(
      profile({
        primary_sport: {
          ...profile().primary_sport!,
          attributes: [{ name: "Height", data_type: "number", value: "12" }],
        },
      })
    )

    const keys = keysOf(catalog)
    expect(keys).toContain("height")
    expect(keys).toContain(`${ATTRIBUTE_KEY_PREFIX}height`)
  })
})

describe("the default order", () => {
  it("is height, the sport attribute, then city", () => {
    expect(defaultSlotKeys(buildSlotCatalog(profile()))).toEqual(["height", FOOT, "city"])
  })

  it("never includes weight, even when everything else is missing", () => {
    const catalog = buildSlotCatalog(
      profile({
        height_cm: null,
        location: null,
        age_group: null,
        primary_sport: null,
      })
    )

    expect(defaultSlotKeys(catalog)).not.toContain("weight")
  })

  it("backfills experience → age_group → joined", () => {
    // No height, no city, and a sport with no attributes logged — so all three
    // of the preferred slots are unavailable and the backfill has to carry it.
    const catalog = buildSlotCatalog(
      profile({
        height_cm: null,
        location: null,
        primary_sport: { ...profile().primary_sport!, attributes: [] },
      })
    )

    expect(defaultSlotKeys(catalog)).toEqual(["experience", "age_group", "joined"])
  })
})

describe("resolveSlots", () => {
  const catalog = buildSlotCatalog(profile())

  it("honours a valid selection", () => {
    expect(keysOf(resolveSlots(catalog, `weight,${FOOT},joined`))).toEqual([
      FOOT,
      "weight",
      "joined",
    ])
  })

  it("drops an unknown key silently and backfills from the default order", () => {
    const resolved = resolveSlots(catalog, "height,not_a_field,city")

    expect(keysOf(resolved)).toEqual(["height", FOOT, "city"])
    expect(resolved).toHaveLength(SLOT_COUNT)
  })

  it("drops a key for a field this player does not have", () => {
    const noWeight = buildSlotCatalog(profile({ weight_kg: null }))
    expect(keysOf(resolveSlots(noWeight, "weight,height,city"))).toEqual([
      "height",
      FOOT,
      "city",
    ])
  })

  it("rejects everything past the third key", () => {
    const resolved = resolveSlots(catalog, `height,city,weight,${FOOT},joined`)

    expect(resolved).toHaveLength(SLOT_COUNT)
    expect(keysOf(resolved)).toEqual(["height", "city", "weight"])
  })

  it("ignores a repeated key rather than filling two slots with it", () => {
    expect(keysOf(resolveSlots(catalog, "height,height,city"))).toEqual([
      "height",
      FOOT,
      "city",
    ])
  })

  it("falls back to the defaults for a missing or empty param", () => {
    expect(keysOf(resolveSlots(catalog, undefined))).toEqual(["height", FOOT, "city"])
    expect(keysOf(resolveSlots(catalog, ""))).toEqual(["height", FOOT, "city"])
    expect(keysOf(resolveSlots(catalog, " , , "))).toEqual(["height", FOOT, "city"])
  })

  it("renders fewer than three when the player has fewer than three fields", () => {
    const sparse = buildSlotCatalog(
      profile({
        height_cm: null,
        weight_kg: null,
        location: null,
        age_group: null,
        primary_sport: null,
      })
    )

    // Only `joined` survives — everyone has a join date.
    expect(keysOf(resolveSlots(sparse, "height,city,weight"))).toEqual(["joined"])
  })

  it("returns catalog order, not requested order", () => {
    // This is what makes the sorted cache key sound: two params naming the same
    // three fields must produce identical bytes, or they would share a CDN
    // entry while wanting different images.
    const a = resolveSlots(catalog, `height,${FOOT},city`)
    const b = resolveSlots(catalog, `city,${FOOT},height`)

    expect(keysOf(a)).toEqual(keysOf(b))
  })
})

describe("canonicalSlotKey", () => {
  it("collapses a reordered list to one cache key", () => {
    expect(canonicalSlotKey(["height", "foot", "city"])).toBe(
      canonicalSlotKey(["city", "foot", "height"])
    )
  })

  it("collapses duplicates too", () => {
    expect(canonicalSlotKey(["height", "height", "city"])).toBe("city,height")
  })

  it("is empty for no slots, so the default card has one key", () => {
    expect(canonicalSlotKey([])).toBe("")
  })
})
