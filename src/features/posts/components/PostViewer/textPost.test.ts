/**
 * textPost — the text-post rules, pinned without a DOM.
 */

import { describe, expect, it } from "vitest"

import { CONTENT_SPLIT_RE } from "@/features/posts/components/PostCard/PostCard"
import type { Post } from "@/features/posts/services/posts.api"
import {
  HASHTAG_SOURCE,
  isLatinText,
  isViewablePost,
  shouldWheelNavigate,
  splitTrailingHashtags,
  textPostSize,
} from "./textPost"

function post(content: string, mediaCount = 0): Post {
  return {
    id: "p",
    content,
    media: Array.from({ length: mediaCount }, (_, i) => ({
      id: `m${i}`,
      media_type: "image",
      file_url: `https://media.goatza.test/p/${i}.webp`,
      thumbnail_url: "",
      duration: null,
      width: null,
      height: null,
      order: i,
    })),
  } as Post
}

describe("isViewablePost", () => {
  it("is true with media, whatever the text", () => {
    expect(isViewablePost(post("", 1))).toBe(true)
  })

  it("is true for non-blank text without media", () => {
    expect(isViewablePost(post("Match day"))).toBe(true)
  })

  it("is false for a blank text-only post", () => {
    expect(isViewablePost(post(""))).toBe(false)
    expect(isViewablePost(post("  \n\t "))).toBe(false)
  })
})

describe("isLatinText", () => {
  it("accepts Latin letters with accents, digits, punctuation and emoji", () => {
    expect(isLatinText("Café ⚽ 3-1! #win")).toBe(true)
    expect(isLatinText("🔥🔥🔥")).toBe(true)
    expect(isLatinText("")).toBe(true)
  })

  it("rejects any non-Latin letter", () => {
    expect(isLatinText("ഇന്ന് കളി")).toBe(false)          // Malayalam
    expect(isLatinText("आज मैच है")).toBe(false)           // Hindi
    expect(isLatinText("مباراة اليوم")).toBe(false)         // Arabic
    expect(isLatinText("Kochi vs കോഴിക്കോട്")).toBe(false)  // mixed
  })
})

describe("textPostSize", () => {
  const line = (n: number) => "a".repeat(n)

  it("steps down at 60 and 160 characters", () => {
    expect(textPostSize(line(60))).toBe("display-xl")
    expect(textPostSize(line(61))).toBe("display-lg")
    expect(textPostSize(line(160))).toBe("display-lg")
    expect(textPostSize(line(161))).toBe("body")
  })

  it("steps down at 5 lines, however short they are", () => {
    expect(textPostSize("a\nb\nc\nd\ne")).toBe("display-xl")
    expect(textPostSize("a\nb\nc\nd\ne\nf")).toBe("body")
    expect(textPostSize(`${line(20)}\n`.repeat(6))).toBe("body")
  })

  it("measures the trimmed text", () => {
    expect(textPostSize(`\n\n  ${line(60)}  \n\n`)).toBe("display-xl")
  })

  it("counts an emoji as one character", () => {
    expect(textPostSize("🔥".repeat(60))).toBe("display-xl")
  })

  it("keeps non-Latin text off the display font", () => {
    expect(textPostSize("ഇന്ന് കളി")).toBe("body-lg")
    expect(textPostSize("മ".repeat(160))).toBe("body-lg")
    expect(textPostSize("മ".repeat(161))).toBe("body")
    expect(textPostSize("മ\nമ\nമ\nമ\nമ\nമ")).toBe("body")
  })

  it("keeps an emoji-only post at a display size", () => {
    expect(textPostSize("⚽🔥🏆")).toBe("display-xl")
  })
})

describe("splitTrailingHashtags", () => {
  // The whole point of the copy: the same charset as the card's linkifier
  // (and so the backend's HASHTAG_RE).
  it("uses the hashtag charset of CONTENT_SPLIT_RE", () => {
    expect(CONTENT_SPLIT_RE.source).toContain(HASHTAG_SOURCE)
  })

  it("splits a trailing run off the sentence", () => {
    expect(splitTrailingHashtags("Match day! #kochi #football")).toEqual({
      body: "Match day!",
      tags: "#kochi #football",
    })
    expect(splitTrailingHashtags("Two lines\n#one\n#two")).toEqual({
      body: "Two lines",
      tags: "#one\n#two",
    })
  })

  it("leaves hashtags in the middle alone", () => {
    expect(splitTrailingHashtags("Big #win for the squad")).toEqual({
      body: "Big #win for the squad",
      tags: "",
    })
    // Only the run that actually ends the text.
    expect(splitTrailingHashtags("Big #win for the squad #kochi")).toEqual({
      body: "Big #win for the squad",
      tags: "#kochi",
    })
  })

  it("leaves a hashtags-only post as it is", () => {
    expect(splitTrailingHashtags("#kochi #football")).toEqual({
      body: "#kochi #football",
      tags: "",
    })
  })

  it("ignores trailing whitespace", () => {
    expect(splitTrailingHashtags("Match day! #kochi  \n")).toEqual({
      body: "Match day!",
      tags: "#kochi",
    })
  })

  it("does not split a word glued to a hashtag", () => {
    expect(splitTrailingHashtags("see#tag")).toEqual({ body: "see#tag", tags: "" })
  })
})

describe("shouldWheelNavigate", () => {
  const box = { scrollHeight: 1000, clientHeight: 400 }

  it("scrolls the text while there is room in the wheel's direction", () => {
    expect(shouldWheelNavigate({ ...box, scrollTop: 200, deltaY: 40 })).toBe(false)
    expect(shouldWheelNavigate({ ...box, scrollTop: 200, deltaY: -40 })).toBe(false)
  })

  it("navigates at the top edge only when scrolling up", () => {
    expect(shouldWheelNavigate({ ...box, scrollTop: 0, deltaY: -40 })).toBe(true)
    expect(shouldWheelNavigate({ ...box, scrollTop: 0, deltaY: 40 })).toBe(false)
  })

  it("navigates at the bottom edge only when scrolling down", () => {
    expect(shouldWheelNavigate({ ...box, scrollTop: 600, deltaY: 40 })).toBe(true)
    expect(shouldWheelNavigate({ ...box, scrollTop: 600, deltaY: -40 })).toBe(false)
    // Sub-pixel scroll positions count as the edge.
    expect(shouldWheelNavigate({ ...box, scrollTop: 599.5, deltaY: 40 })).toBe(true)
  })

  it("navigates when the text does not scroll at all", () => {
    expect(shouldWheelNavigate({ scrollHeight: 300, clientHeight: 400, scrollTop: 0, deltaY: 40 })).toBe(true)
    expect(shouldWheelNavigate({ scrollHeight: 400, clientHeight: 400, scrollTop: 0, deltaY: -40 })).toBe(true)
  })
})
