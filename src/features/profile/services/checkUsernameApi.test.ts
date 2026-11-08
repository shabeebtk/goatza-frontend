/**
 * The handle check. A page's handle is checked `for: "organization"` (the
 * person's own handle is taken there), and an invalid handle is an answer,
 * not a thrown error.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { AxiosError, type AxiosResponse } from "axios"

const get = vi.hoisted(() => vi.fn())
vi.mock("@/core/api/axios", () => ({ default: { get } }))

import { checkUsernameApi } from "./profile.api"

const ok = (data: object, message = "Username available") => ({
  data: { success: true, message, data },
})

const badRequest = (body: object) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    data: body,
  } as AxiosResponse)

// A block body: an arrow returning the mock would hand vitest a teardown to call.
beforeEach(() => {
  get.mockReset()
})

describe("checkUsernameApi", () => {
  it("asks for the person when no scope is given", async () => {
    get.mockResolvedValue(ok({ username: "kannur_fc", valid: true, available: true }))

    const result = await checkUsernameApi("kannur_fc")

    expect(get).toHaveBeenCalledWith("/user/check/username/availability", {
      params: { username: "kannur_fc" },
    })
    expect(result).toMatchObject({ username: "kannur_fc", valid: true, available: true })
  })

  it("sends for=organization and org_id for a page", async () => {
    get.mockResolvedValue(
      ok({ username: "kannur_fc", valid: true, available: false, suggestion: "kannur_fc42" },
        "Username already taken")
    )

    const result = await checkUsernameApi("kannur_fc", { for: "organization", orgId: "org-1" })

    expect(get).toHaveBeenCalledWith("/user/check/username/availability", {
      params: { username: "kannur_fc", for: "organization", org_id: "org-1" },
    })
    expect(result).toEqual({
      username: "kannur_fc",
      valid: true,
      available: false,
      suggestion: "kannur_fc42",
      message: "Username already taken",
    })
  })

  it("turns the server's 400 into valid=false with its reason", async () => {
    get.mockRejectedValue(
      badRequest({
        success: false,
        message: "This username is not allowed",
        data: { username: "settings", valid: false },
      })
    )

    const result = await checkUsernameApi("Settings", { for: "organization" })

    expect(result).toEqual({
      username: "settings",
      valid: false,
      available: false,
      message: "This username is not allowed",
    })
  })

  it("still throws for a network error or a 5xx", async () => {
    get.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"))

    await expect(checkUsernameApi("kannur_fc")).rejects.toThrow("Network Error")
  })
})
