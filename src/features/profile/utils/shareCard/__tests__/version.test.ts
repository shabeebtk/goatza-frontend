/**
 * The cache-buster.
 *
 * The failure this guards is silent and slow: a redesigned card that nobody
 * sees, because `updated_at` has not moved on a profile nobody has edited and
 * the CDN — and the scrapers that never re-request an image URL twice — go on
 * serving the old picture.
 */

import { describe, expect, it } from "vitest"

import { CARD_LAYOUT_VERSION, versionTag } from "../version"

const UPDATED = "2026-08-01T09:00:00Z"

/** The hash the pre-CARD_LAYOUT_VERSION implementation produced for UPDATED:
 *  FNV-1a over the bare timestamp. Pinned as a literal because the point is
 *  that today's tag is NOT this. */
const TAG_BEFORE_LAYOUT_VERSIONING = "c4c85be5"

describe("versionTag", () => {
  it("moves when the profile is edited", () => {
    expect(versionTag(UPDATED)).not.toBe(versionTag("2026-08-06T09:00:00Z"))
  })

  it("is stable for an unedited profile, so the CDN entry survives", () => {
    expect(versionTag(UPDATED)).toBe(versionTag(UPDATED))
  })

  it("is eight hex characters at most, not a timestamp", () => {
    expect(versionTag(UPDATED)).toMatch(/^[0-9a-f]{1,8}$/)
  })

  it("no longer matches the pre-layout-version hash for the same timestamp", () => {
    // An unedited profile has to pick up a redesign. This is the assertion that
    // says it does.
    expect(versionTag(UPDATED)).not.toBe(TAG_BEFORE_LAYOUT_VERSIONING)
  })

  it("would move again on the next layout bump", () => {
    // The constant is genuinely in the hash input rather than merely exported —
    // this reproduces the hash for a different version and requires it to
    // differ from the shipped one.
    const fnv = (input: string) => {
      let hash = 0x811c9dc5
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
      }
      return (hash >>> 0).toString(16)
    }

    expect(versionTag(UPDATED)).toBe(fnv(`${CARD_LAYOUT_VERSION}|${UPDATED}`))
    expect(versionTag(UPDATED)).not.toBe(fnv(`${CARD_LAYOUT_VERSION + 1}|${UPDATED}`))
  })

  it("still produces a tag with no timestamp at all", () => {
    // A profile we have no `updated_at` for is not a profile that gets pinned
    // to an old layout.
    expect(versionTag(null)).toBeTruthy()
    expect(versionTag(null)).not.toBe(versionTag(UPDATED))
  })
})
