// @vitest-environment jsdom
/**
 * A save that never answers must end. The api client has no timeout of its
 * own, so the match writes carry one, and running out of it says something the
 * player can act on rather than "check your internet connection".
 */

import { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/core/auth/refreshManager", () => ({
    getFreshAccessToken: vi.fn(),
    SessionExpiredError: class SessionExpiredError extends Error {},
}))

import api from "@/core/api/axios"
import {
    MATCH_SAVE_TIMEOUT_MESSAGE,
    MATCH_WRITE_TIMEOUT_MS,
    createMatchApi,
    getMatchDiaryErrorMessage,
    isRequestTimeout,
    updateMatchApi,
    type CreateMatchPayload,
} from "./matches.api"

const originalAdapter = api.defaults.adapter
let timeouts: (number | undefined)[] = []

beforeEach(() => {
    timeouts = []
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        timeouts.push(config.timeout)
        throw new AxiosError(
            `timeout of ${config.timeout}ms exceeded`,
            AxiosError.ECONNABORTED,
            config
        )
    }
})

afterEach(() => {
    api.defaults.adapter = originalAdapter
})

const PAYLOAD = { sport: "sport-1", date: "2026-11-01" } as CreateMatchPayload

describe("match writes", () => {
    it("give up after MATCH_WRITE_TIMEOUT_MS, create and update alike", async () => {
        await expect(createMatchApi(PAYLOAD)).rejects.toBeInstanceOf(AxiosError)
        await expect(updateMatchApi("m-1", {})).rejects.toBeInstanceOf(AxiosError)

        expect(timeouts).toEqual([MATCH_WRITE_TIMEOUT_MS, MATCH_WRITE_TIMEOUT_MS])
    })

    it("say it may already be saved when they run out of time", async () => {
        const err = await createMatchApi(PAYLOAD).catch((e: unknown) => e)

        expect(isRequestTimeout(err)).toBe(true)
        expect(getMatchDiaryErrorMessage(err)).toBe(MATCH_SAVE_TIMEOUT_MESSAGE)
    })
})

describe("isRequestTimeout", () => {
    it("is not fooled by a plain abort, which carries the same code", () => {
        const aborted = new AxiosError("Request aborted", AxiosError.ECONNABORTED)
        expect(isRequestTimeout(aborted)).toBe(false)
    })

    it("knows the clarified code too", () => {
        expect(isRequestTimeout(new AxiosError("timeout", AxiosError.ETIMEDOUT))).toBe(true)
    })
})
