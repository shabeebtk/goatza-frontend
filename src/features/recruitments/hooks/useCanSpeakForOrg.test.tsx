// @vitest-environment jsdom
/**
 * Download and Delete are offered on recruitments.speak, not on a role name. Both
 * read this one hook (ApplicantsList, StatusChangeMenu, RecruitmentDetail).
 */

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useCanSpeakForOrg } from "./useRecruitments"

const mocks = vi.hoisted(() => ({ org: null as unknown, detail: vi.fn() }))

vi.mock("@/features/organization/hooks/useOrganizations", () => ({
  useOrgDetail: (...args: unknown[]) => {
    mocks.detail(...args)
    return { data: mocks.org }
  },
}))

afterEach(cleanup)

describe("useCanSpeakForOrg", () => {
  it("is true with recruitments.speak", () => {
    mocks.org = { my_role: "coach", my_permissions: ["recruitments.speak"] }

    expect(renderHook(() => useCanSpeakForOrg("org-1")).result.current).toBe(true)
  })

  it("is false without it, even for a role that used to be enough", () => {
    mocks.org = { my_role: "owner", my_permissions: ["members.view"] }

    expect(renderHook(() => useCanSpeakForOrg("org-1")).result.current).toBe(false)
  })

  it("asks nothing and answers no without an org", () => {
    mocks.org = undefined

    expect(renderHook(() => useCanSpeakForOrg(undefined)).result.current).toBe(false)
    expect(mocks.detail).toHaveBeenLastCalledWith("", "id", false)
  })
})
