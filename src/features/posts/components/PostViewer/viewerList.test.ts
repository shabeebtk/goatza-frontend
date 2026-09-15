/**
 * viewerList — the list rules, pinned without a DOM.
 */

import { describe, expect, it } from "vitest"

import type { Post } from "@/features/posts/services/posts.api"
import {
  MAX_EMPTY_PAGES,
  autoFetchExhausted,
  emptyPageStreak,
  nextActiveId,
  shouldFetchMore,
  tailSlide,
  viewablePosts,
} from "./viewerList"

function post(id: string, mediaCount: number, content = ""): Post {
  return {
    id,
    content,
    media: Array.from({ length: mediaCount }, (_, i) => ({
      id: `${id}-m${i}`,
      media_type: "image",
      file_url: `https://media.goatza.test/${id}/${i}.webp`,
      thumbnail_url: "",
      duration: null,
      width: null,
      height: null,
      order: i,
    })),
  } as Post
}

describe("viewablePosts", () => {
  it("keeps posts with media or text, in order, and skips blank ones", () => {
    const list = viewablePosts([
      post("a", 1),
      post("b", 0, "Trials this Sunday"),
      post("c", 0, "   \n  "),
      post("d", 2),
      post("e", 0),
    ])
    expect(list.map((p) => p.id)).toEqual(["a", "b", "d"])
  })

  // The feed's variety pattern can hand back a post twice across pages.
  it("dedupes by id, first occurrence wins", () => {
    const first = post("a", 1)
    const again = post("a", 3)
    const text = post("t", 0, "Match day")
    const list = viewablePosts([first, text, post("b", 1), again, text])
    expect(list.map((p) => p.id)).toEqual(["a", "t", "b"])
    expect(list[0]).toBe(first)
  })
})

describe("nextActiveId", () => {
  const before = ["a", "b", "c", "d"]

  it("keeps the active post while it is still there", () => {
    expect(nextActiveId(before, ["a", "c", "d"], "c")).toBe("c")
  })

  it("moves forward to the next survivor when the active post is gone", () => {
    expect(nextActiveId(before, ["a", "c", "d"], "b")).toBe("c")
    // Two removed at once still walks to the nearest survivor ahead.
    expect(nextActiveId(before, ["a", "d"], "b")).toBe("d")
  })

  it("falls back to the previous survivor when the active post was last", () => {
    expect(nextActiveId(before, ["a", "b", "c"], "d")).toBe("c")
  })

  it("is null when nothing is left", () => {
    expect(nextActiveId(before, [], "b")).toBeNull()
  })

  // A refetch that reorders everything: no memory of where it was.
  it("starts from the top when the active id was never in the previous list", () => {
    expect(nextActiveId(["x"], ["a", "b"], "q")).toBe("a")
  })
})

describe("shouldFetchMore", () => {
  it("fires within 3 of the last loaded media post", () => {
    const base = { count: 10, hasNextPage: true, isFetchingNextPage: false }
    expect(shouldFetchMore({ ...base, index: 5 })).toBe(false)
    expect(shouldFetchMore({ ...base, index: 6 })).toBe(false)
    expect(shouldFetchMore({ ...base, index: 7 })).toBe(true)
    expect(shouldFetchMore({ ...base, index: 9 })).toBe(true)
  })

  it("never fires while fetching or at the end", () => {
    expect(shouldFetchMore({ index: 9, count: 10, hasNextPage: true, isFetchingNextPage: true })).toBe(false)
    expect(shouldFetchMore({ index: 9, count: 10, hasNextPage: false, isFetchingNextPage: false })).toBe(false)
  })

  it("fires on an empty list that has more (every post so far was blank)", () => {
    expect(shouldFetchMore({ index: -1, count: 0, hasNextPage: true, isFetchingNextPage: false })).toBe(false)
    expect(shouldFetchMore({ index: 0, count: 1, hasNextPage: true, isFetchingNextPage: false })).toBe(true)
  })
})

describe("empty pages", () => {
  it("auto-fetches through up to five pages that added nothing", () => {
    let streak = 0
    for (let i = 0; i < MAX_EMPTY_PAGES; i++) {
      expect(autoFetchExhausted(streak)).toBe(false)
      streak = emptyPageStreak(streak, 0)
    }
    expect(streak).toBe(5)
    expect(autoFetchExhausted(streak)).toBe(true)
  })

  it("resets the streak as soon as a page adds a viewable post", () => {
    expect(emptyPageStreak(4, 2)).toBe(0)
  })
})

describe("tailSlide", () => {
  const base = { hasPagination: true, hasNextPage: true, isFetchingNextPage: false, isError: false, exhausted: false }

  it("is nothing without pagination (single-post mode)", () => {
    expect(tailSlide({ ...base, hasPagination: false, hasNextPage: false })).toBeNull()
  })

  it("prefers the error, then the end, then the fetch state", () => {
    expect(tailSlide({ ...base, isError: true, hasNextPage: false })).toBe("error")
    expect(tailSlide({ ...base, hasNextPage: false })).toBe("end")
    expect(tailSlide({ ...base, isFetchingNextPage: true })).toBe("loading")
    expect(tailSlide({ ...base, exhausted: true })).toBe("load-more")
    expect(tailSlide(base)).toBe("loading")
  })
})
