// @vitest-environment jsdom
/**
 * A member who lost access and whose socket missed it: the first request refused
 * with "You are not part of this organization" hands the news to the same place the
 * server's event goes, once, and the caller still gets its error.
 */

import { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const refresh = vi.hoisted(() => ({ getFreshAccessToken: vi.fn() }))
vi.mock("@/core/auth/refreshManager", () => ({
  getFreshAccessToken: refresh.getFreshAccessToken,
  SessionExpiredError: class SessionExpiredError extends Error {},
}))

import { ORG_MEMBERSHIP_CHANGED, realtimeBus } from "@/core/ws/realtimeBus"
import { useAuthStore } from "@/store/auth.store"
import api from "./axios"

const NOT_A_MEMBER = "You are not part of this organization"

const originalAdapter = api.defaults.adapter
let refusalBody: Record<string, unknown>
let listener: Mock<(event: unknown) => void>
let unsubscribe: () => void

const actAsOrg = (id = "org-1") =>
  useAuthStore.setState({ actorType: "organization", actorId: id } as never)

/** What useOrgMembershipEvents does first, and the reason the rest can't repeat. */
const subscribeLikeTheRealHandler = () => {
  unsubscribe = realtimeBus.on(ORG_MEMBERSHIP_CHANGED, (event) => {
    listener(event)
    useAuthStore.getState().switchToUser()
  })
}

beforeEach(() => {
  refusalBody = { detail: NOT_A_MEMBER }
  listener = vi.fn()
  unsubscribe = () => undefined
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError("refused", "ERR_BAD_REQUEST", config, null, {
      data: refusalBody,
      status: 403,
      statusText: "",
      headers: {},
      config,
    })
  }
  useAuthStore.setState({
    user: { id: "user-1", username: "me" } as never,
    actorType: "user",
    actorId: null,
    accessToken: "token-1",
  } as never)
})

afterEach(() => {
  unsubscribe()
  api.defaults.adapter = originalAdapter
})

describe("403: not part of this organization", () => {
  it("raises the event, and the caller still gets its error", async () => {
    actAsOrg()
    subscribeLikeTheRealHandler()

    await expect(api.get("/feed/list")).rejects.toMatchObject({
      response: { status: 403 },
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({
      notification_type: ORG_MEMBERSHIP_CHANGED,
      organization_id: "org-1",
      status: "removed",
    })
  })

  it("reads the standard envelope too, which the members views answer with", async () => {
    refusalBody = { success: false, message: NOT_A_MEMBER, data: { code: "forbidden" } }
    actAsOrg()
    subscribeLikeTheRealHandler()

    await expect(api.get("/organizations/members")).rejects.toBeDefined()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("fires once however many requests were in flight, and never loops", async () => {
    actAsOrg()
    subscribeLikeTheRealHandler()

    await Promise.allSettled([api.get("/a"), api.get("/b"), api.get("/c")])
    await expect(api.get("/d")).rejects.toBeDefined()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().actorType).toBe("user")
    expect(refresh.getFreshAccessToken).not.toHaveBeenCalled()
  })

  it("stays quiet acting as the person", async () => {
    subscribeLikeTheRealHandler()

    await expect(api.get("/feed/list")).rejects.toBeDefined()

    expect(listener).not.toHaveBeenCalled()
  })

  it("stays quiet for a request made as another org than the one being acted as", async () => {
    actAsOrg("org-2")
    subscribeLikeTheRealHandler()

    await expect(
      api.get("/upload", { actor: { type: "organization", id: "org-1" } })
    ).rejects.toBeDefined()

    expect(listener).not.toHaveBeenCalled()
    expect(useAuthStore.getState().actorId).toBe("org-2")
  })

  it("stays quiet for any other 403", async () => {
    refusalBody = { detail: "Only the organization's owners can manage members." }
    actAsOrg()
    subscribeLikeTheRealHandler()

    await expect(api.get("/organizations/members/invites")).rejects.toBeDefined()

    expect(listener).not.toHaveBeenCalled()
    expect(useAuthStore.getState().actorId).toBe("org-1")
  })
})
