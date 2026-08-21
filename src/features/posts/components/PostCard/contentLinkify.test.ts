import { describe, expect, it } from "vitest"

import { CONTENT_SPLIT_RE } from "./PostCard"

/**
 * The linkifier's charset is meant to be byte-for-byte the backend's
 * (posts/services/post_content_service.py, MENTION_RE / HASHTAG_RE). Drift
 * between them means a handle the backend resolved renders as prose, or a
 * token the frontend links resolves to nothing.
 *
 * The case table below is the same one the backend asserts in
 * usernames/tests/test_username_namespace.py::MentionCharsetTests.
 */

function mentions(text: string): string[] {
  return text
    .split(CONTENT_SPLIT_RE)
    .filter((part, index) => index % 2 === 1 && part.startsWith("@"))
    .map((part) => part.slice(1).toLowerCase())
}

describe("CONTENT_SPLIT_RE — mentions", () => {
  it("stops at a full stop", () => {
    expect(mentions("Great game @kochifc.")).toEqual(["kochifc"])
  })

  it("stops at the dot in a dotted handle", () => {
    // The dot was an organization-only character; the shared namespace dropped
    // it, so "@kochi.fc" is the handle "kochi" followed by prose — the trailing
    // ".fc" carries no "@" and is not a second mention.
    expect(mentions("well played @kochi.fc")).toEqual(["kochi"])
  })

  it("matches regardless of case", () => {
    expect(mentions("@Rahul10 and @rahul10")).toEqual(["rahul10", "rahul10"])
  })

  it("accepts underscores and digits", () => {
    expect(mentions("@kochi_fc_11 played")).toEqual(["kochi_fc_11"])
  })

  it("tokenizes inside an email address, and that is fine", () => {
    // Not a mention rule, just the documented consequence: the linkifier only
    // renders handles the BACKEND resolved, so an unmatched token stays text.
    expect(mentions("mail me@example.com")).toEqual(["example"])
  })
})

describe("CONTENT_SPLIT_RE — hashtags", () => {
  function hashtags(text: string): string[] {
    return text
      .split(CONTENT_SPLIT_RE)
      .filter((part, index) => index % 2 === 1 && part.startsWith("#"))
      .map((part) => part.slice(1))
  }

  it("stops at punctuation", () => {
    expect(hashtags("what a #matchday!")).toEqual(["matchday"])
  })
})
