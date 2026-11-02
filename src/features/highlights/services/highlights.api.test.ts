/**
 * submitHighlightApi: a 201 IS a created highlight, whatever its body looks
 * like — a strict parse once turned schema drift into a "failed" upload whose
 * Retry created the clip a second time.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/core/api/axios", () => ({
    default: api,
    withActor: (actor?: unknown) => (actor ? { actor } : {}),
}))

import { submitHighlightApi } from "./highlights.api"

beforeEach(() => {
    api.post.mockReset()
})

describe("submitHighlightApi", () => {
    it("a 201 that does not parse is still created — by its id", async () => {
        api.post.mockResolvedValue({ status: 201, data: { data: { id: "h-1", visibility: "a-new-level" } } })
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

        await expect(submitHighlightApi({ media_job_id: "job-1" })).resolves.toEqual({
            kind: "created",
            highlightId: "h-1",
        })
        warn.mockRestore()
    })

    it("a 202 is the server's publication", async () => {
        const publication = { id: "pub-1", status: "processing" }
        api.post.mockResolvedValue({ status: 202, data: { data: { pending_publication: publication } } })

        await expect(submitHighlightApi({ media_job_id: "job-1" })).resolves.toEqual({
            kind: "pending",
            publication,
        })
    })

    it("is made as the given account", async () => {
        api.post.mockResolvedValue({ status: 201, data: { data: { id: "h-2" } } })
        const actor = { type: "user" as const }

        await submitHighlightApi({ media_job_id: "job-1" }, actor)

        expect(api.post.mock.calls[0][2]).toEqual({ actor })
    })
})
