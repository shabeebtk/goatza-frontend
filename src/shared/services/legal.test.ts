/**
 * The drift guard.
 *
 * Three version numbers have to agree: `LEGAL_DOCUMENT_VERSION` here, the
 * `version` in each document's frontmatter, and `TERMS_VERSION`/
 * `PRIVACY_VERSION` in the backend's legal/constants.py. This file can only
 * check the first two — the third lives in another repo and is deliberately
 * NOT fetched (a Vercel build must never fail because Render was asleep), so
 * the backend half is kept in step by bumping both in the same change.
 *
 * What that leaves this test guarding is the exact mistake the split invites:
 * updating the markdown and forgetting the constant, which ships a page
 * printing one version while the consent gate records another.
 */

import { describe, expect, it } from "vitest"

import {
  formatLegalDate,
  getLegalDocument,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_DOCUMENTS,
  stripDocumentHeading,
  type LegalSlug,
} from "./legal"

const SLUGS = Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]

describe("legal documents", () => {
  it("has exactly the four documents the routes expect", () => {
    expect(SLUGS.sort()).toEqual(["guidelines", "privacy", "safety", "terms"])
  })

  it.each(SLUGS)("%s frontmatter version matches the constant", (slug) => {
    const document = getLegalDocument(slug)

    expect(document.version).toBe(LEGAL_DOCUMENT_VERSION)
  })

  it.each(SLUGS)("%s has a title and a last-updated date", (slug) => {
    const document = getLegalDocument(slug)

    expect(document.title).not.toBe("")
    expect(document.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each(SLUGS)("%s has a body, not just frontmatter", (slug) => {
    const document = getLegalDocument(slug)

    // A file whose content failed to parse still returns a valid-looking
    // object, so the page would render an empty document rather than fail.
    expect(document.content.trim().length).toBeGreaterThan(500)
  })

  it("every document is reachable at its own route", () => {
    // The keys ARE the URL segments (/terms, /privacy, …), and each one is
    // also reserved on the backend so no user can claim the handle and shadow
    // the page. A key renamed here without the matching rename there is a
    // route that resolves to a profile lookup.
    for (const slug of SLUGS) {
      expect(slug).toMatch(/^[a-z]+$/)
    }
  })
})

describe("stripDocumentHeading", () => {
  it("removes the H1 and the version line the page renders itself", () => {
    const body = stripDocumentHeading(
      '# Terms of Service\n\n**Version 2026-10-01 · Effective 1 October 2026**\n\n## 1. About\n\nText.',
    )

    expect(body.startsWith("## 1. About")).toBe(true)
  })

  it("leaves a document that has no title block alone", () => {
    const body = stripDocumentHeading("## 1. About\n\nText.")

    expect(body).toBe("## 1. About\n\nText.")
  })

  it.each(SLUGS)("%s drops its title block and keeps everything else", (slug) => {
    const document = getLegalDocument(slug)
    const body = stripDocumentHeading(document.content).trim()

    // No H1 left (the page renders one from frontmatter), and no version line
    // left either — /safety writes its version UNDER a subtitle, so a strip
    // that only looked at the first paragraph would print it twice.
    expect(body.startsWith("# ")).toBe(false)
    expect(body).not.toContain("**Version")

    // The strip is regex-driven over content pasted by hand, so the other
    // failure mode is eating too much.
    expect(body.length).toBeGreaterThan(500)
  })

  it("keeps a subtitle that sits above the version line", () => {
    const body = stripDocumentHeading(
      "# Youth Safety\n\n**A guide for parents**\n\n**Version 2026-10-01 · Last updated 1 October 2026**\n\n---\n\n## What Goatza is\n",
    )

    expect(body).toContain("**A guide for parents**")
    expect(body).not.toContain("**Version")
  })
})

describe("formatLegalDate", () => {
  it("renders an ISO date the way the documents write it", () => {
    expect(formatLegalDate("2026-10-01")).toBe("1 October 2026")
  })

  it("passes anything that is not an ISO date straight through", () => {
    expect(formatLegalDate("soon")).toBe("soon")
  })
})
