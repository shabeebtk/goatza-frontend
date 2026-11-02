// @vitest-environment jsdom
/**
 * The actor headers: the store's active actor by default, a request's own
 * `actor` when it carries one — and the 401 refresh-and-retry re-sends that,
 * not whoever is active by the time the retry goes out.
 */

import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.hoisted(() => ({ getFreshAccessToken: vi.fn() }))
vi.mock("@/core/auth/refreshManager", () => ({
    getFreshAccessToken: refresh.getFreshAccessToken,
    SessionExpiredError: class SessionExpiredError extends Error {},
}))

import { useAuthStore } from "@/store/auth.store"
import api, { captureRequestActor } from "./axios"

type Sent = { url?: string; headers: Record<string, unknown> }
let sent: Sent[] = []
/** Status to answer each request with, in order; 200 once they run out. */
let answers: number[] = []

const originalAdapter = api.defaults.adapter

beforeEach(() => {
    sent = []
    answers = []
    refresh.getFreshAccessToken.mockReset()
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        sent.push({ url: config.url, headers: AxiosHeaders.from(config.headers).toJSON() })
        const status = answers.shift() ?? 200
        const response = { data: { data: {} }, status, statusText: "", headers: {}, config }
        if (status >= 400) {
            throw new AxiosError("refused", "ERR_BAD_REQUEST", config, null, response)
        }
        return response
    }
    useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
        accessToken: "token-1",
    } as never)
})

afterEach(() => {
    api.defaults.adapter = originalAdapter
})

const actingAsOrg = () =>
    useAuthStore.setState({ actorType: "organization", actorId: "org-1" } as never)

describe("actor headers", () => {
    it("default to the store's active actor, as before", async () => {
        actingAsOrg()
        await api.get("/x")
        expect(sent[0].headers).toMatchObject({
            "X-Actor-Type": "organization",
            "X-Actor-Id": "org-1",
        })
    })

    it("follow the request's own actor over the store", async () => {
        actingAsOrg()
        await api.get("/x", { actor: { type: "user" } })
        expect(sent[0].headers["X-Actor-Type"]).toBe("user")
        expect(sent[0].headers).not.toHaveProperty("X-Actor-Id")

        useAuthStore.setState({ actorType: "user", actorId: null } as never)
        await api.get("/y", { actor: { type: "organization", id: "org-1" } })
        expect(sent[1].headers).toMatchObject({
            "X-Actor-Type": "organization",
            "X-Actor-Id": "org-1",
        })
    })

    it("keep the request's actor through the 401 refresh-and-retry", async () => {
        const actor = { type: "organization" as const, id: "org-1" }
        answers = [401]
        refresh.getFreshAccessToken.mockImplementation(async () => {
            // The refresh stores the new token (as the real one does), and the
            // author has switched to their personal account meanwhile.
            useAuthStore.setState({ accessToken: "token-2", actorType: "user", actorId: null } as never)
            return "token-2"
        })

        await api.post("/posts/create", {}, { actor })

        expect(sent).toHaveLength(2)
        expect(sent[1].headers).toMatchObject({
            Authorization: "Bearer token-2",
            "X-Actor-Type": "organization",
            "X-Actor-Id": "org-1",
        })
    })

    it("captureRequestActor freezes the active one", () => {
        expect(captureRequestActor()).toEqual({ type: "user" })
        actingAsOrg()
        expect(captureRequestActor()).toEqual({ type: "organization", id: "org-1" })
    })
})
