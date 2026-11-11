// @vitest-environment jsdom
/**
 * What a failed create says, and that it ends. A server failure used to read
 * "Check your connection", and DRF's own refusals (the terms gate) carry only
 * `detail`, which was dropped for the same sentence.
 */

import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/core/auth/refreshManager", () => ({
    getFreshAccessToken: vi.fn(),
    SessionExpiredError: class SessionExpiredError extends Error {},
}))

import api from "@/core/api/axios"
import {
    CREATE_ORG_CONNECTION_MESSAGE,
    CREATE_ORG_SERVER_MESSAGE,
    CREATE_ORG_TIMEOUT_MS,
    createOrganizationApi,
    getMyOrganizationsAsPersonApi,
    toCreateOrgError,
} from "./organization.api"

const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig

const answered = (status: number, data: unknown) =>
    new AxiosError("refused", "ERR_BAD_RESPONSE", config, null, {
        status,
        statusText: "",
        headers: {},
        config,
        data,
    })

describe("toCreateOrgError", () => {
    it("says the server failed on a 5xx, and keeps it a lost answer", () => {
        const error = toCreateOrgError(
            answered(500, { success: false, message: "Something went wrong" })
        )
        // `network` is what makes the flow look for the page before showing it.
        expect(error.code).toBe("network")
        expect(error.message).toBe(CREATE_ORG_SERVER_MESSAGE)
    })

    it("shows DRF's own words for a refusal that only has `detail`", () => {
        const error = toCreateOrgError(
            answered(403, {
                detail: "Please accept the updated terms to continue.",
                code: "TERMS_ACCEPTANCE_REQUIRED",
            })
        )
        expect(error.code).toBe("unknown")
        expect(error.message).toBe("Please accept the updated terms to continue.")
    })

    it("keeps the connection sentence for no answer at all", () => {
        const error = toCreateOrgError(new AxiosError("Network Error", "ERR_NETWORK", config))
        expect(error.code).toBe("network")
        expect(error.message).toBe(CREATE_ORG_CONNECTION_MESSAGE)
    })
})

describe("time limits", () => {
    const originalAdapter = api.defaults.adapter
    afterEach(() => {
        api.defaults.adapter = originalAdapter
    })

    it("gives the create a timeout, and running out is a lost answer", async () => {
        const timeouts: (number | undefined)[] = []
        api.defaults.adapter = async (sent: InternalAxiosRequestConfig) => {
            timeouts.push(sent.timeout)
            throw new AxiosError(`timeout of ${sent.timeout}ms exceeded`, "ECONNABORTED", sent)
        }

        const error = await createOrganizationApi({ name: "Kannur FC", type: "club" }).catch(
            (e: unknown) => e
        )

        expect(timeouts).toEqual([CREATE_ORG_TIMEOUT_MS])
        expect(error).toMatchObject({ code: "network", message: CREATE_ORG_CONNECTION_MESSAGE })
    })

    it("passes a list timeout through only when asked", async () => {
        const timeouts: (number | undefined)[] = []
        api.defaults.adapter = async (sent: InternalAxiosRequestConfig) => {
            timeouts.push(sent.timeout)
            return { data: { data: [] }, status: 200, statusText: "", headers: {}, config: sent }
        }

        await getMyOrganizationsAsPersonApi({ timeout: 15_000 })
        await getMyOrganizationsAsPersonApi()

        expect(timeouts[0]).toBe(15_000)
        // The instance default (no timeout) when not asked.
        expect(timeouts[1]).toBe(0)
    })
})
