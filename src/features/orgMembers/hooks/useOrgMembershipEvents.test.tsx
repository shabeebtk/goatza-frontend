// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { realtimeBus } from "@/core/ws/realtimeBus"
import { useAuthStore } from "@/store/auth.store"
import { markLeaving, unmarkLeaving } from "../leavingOrganizations"
import { useOrgMembershipEvents } from "./useOrgMembershipEvents"

const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))

const DREAM = { id: "org-1", name: "Dream FC", username: "dreamfc" }
const RIVAL = { id: "org-2", name: "Rival FC", username: "rivalfc" }

let client: QueryClient
let invalidate: ReturnType<typeof vi.spyOn>

const emit = (organization_id: string, status: string, role = "coach") =>
  act(() => {
    realtimeBus.emit({
      notification_type: "org_membership_changed",
      organization_id,
      status,
      role,
    })
  })

const actingAs = (org: typeof DREAM | null) =>
  useAuthStore.setState({
    actorType: org ? "organization" : "user",
    actorId: org?.id ?? null,
    currentOrganization: (org as never) ?? null,
    organizations: [DREAM, RIVAL] as never,
  })

beforeEach(() => {
  mocks.push.mockReset()
  mocks.toast.mockReset()
  client = new QueryClient()
  invalidate = vi.spyOn(client, "invalidateQueries")

  renderHook(() => useOrgMembershipEvents(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
})

afterEach(() => {
  cleanup()
  unmarkLeaving(DREAM.id)
})

describe("Losing access while acting as the org", () => {
  it.each(["removed", "left"])("%s switches to the person, says so and goes home", (status) => {
    actingAs(DREAM)
    const clear = vi.spyOn(client, "clear")

    emit(DREAM.id, status)

    const state = useAuthStore.getState()
    expect(state.actorType).toBe("user")
    expect(state.actorId).toBeNull()
    expect(state.currentOrganization).toBeNull()
    expect(state.organizations.map((org) => org.id)).toEqual([RIVAL.id])
    expect(clear).toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast.mock.calls[0][0].title).toBe("You're no longer a member of Dream FC")
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith("/home")
  })

  it("does it once when the same news arrives twice", () => {
    actingAs(DREAM)

    emit(DREAM.id, "removed")
    emit(DREAM.id, "removed")

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })

  it("leaves it to the leave flow on the device that is leaving", () => {
    actingAs(DREAM)
    markLeaving(DREAM.id)

    emit(DREAM.id, "left")

    expect(useAuthStore.getState().actorId).toBe(DREAM.id)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

describe("Losing access to a different org", () => {
  it("drops it from the list without moving the person", () => {
    actingAs(RIVAL)

    emit(DREAM.id, "removed")

    const state = useAuthStore.getState()
    expect(state.actorId).toBe(RIVAL.id)
    expect(state.organizations.map((org) => org.id)).toEqual([RIVAL.id])
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["organizations", "list"] })
  })

  it("does the same while acting as the person", () => {
    actingAs(null)

    emit(DREAM.id, "removed")

    expect(useAuthStore.getState().actorType).toBe("user")
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

describe("Keeping access", () => {
  it("role_changed refreshes the org, which is what carries my_permissions", () => {
    actingAs(DREAM)

    emit(DREAM.id, "role_changed", "staff")

    expect(useAuthStore.getState().actorId).toBe(DREAM.id)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["organizations"] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["org-members"] })
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("active refreshes the org list", () => {
    actingAs(null)

    emit(DREAM.id, "active")

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["organizations"] })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
