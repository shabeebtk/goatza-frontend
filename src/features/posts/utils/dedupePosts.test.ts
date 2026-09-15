/**
 * dedupePosts — one entry per id, first occurrence wins, order kept. Every
 * list runs its flattened pages through this, and the viewer derives its
 * list from the same pass, so the two agree.
 */

import { describe, expect, it } from "vitest"

import type { Post } from "@/features/posts/services/posts.api"
import { dedupePosts } from "./dedupePosts"

const post = (id: string) => ({ id }) as Post

describe("dedupePosts", () => {
  it("keeps the first occurrence and the order", () => {
    const first = post("a")
    const again = post("a")
    const list = dedupePosts([first, post("b"), again, post("c"), post("b")])

    expect(list.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(list[0]).toBe(first)
  })

  it("hands back an empty list for an empty list", () => {
    expect(dedupePosts([])).toEqual([])
  })
})
