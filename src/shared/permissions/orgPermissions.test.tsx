// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { ORG_PERMISSIONS, hasOrgPermission, orgRoleLabel, useOrgPermission } from "./orgPermissions"

afterEach(() => {
  cleanup()
  useAuthStore.setState({ currentOrganization: null })
})

describe("hasOrgPermission", () => {
  it("reads the server's list and nothing else", () => {
    const org = { my_permissions: ["members.view"] }

    expect(hasOrgPermission(org, ORG_PERMISSIONS.MEMBERS_VIEW)).toBe(true)
    expect(hasOrgPermission(org, ORG_PERMISSIONS.MEMBERS_MANAGE)).toBe(false)
  })

  it("says no when there is nothing to read", () => {
    expect(hasOrgPermission(null, ORG_PERMISSIONS.MEMBERS_VIEW)).toBe(false)
    expect(hasOrgPermission(undefined, ORG_PERMISSIONS.MEMBERS_VIEW)).toBe(false)
    expect(hasOrgPermission({}, ORG_PERMISSIONS.MEMBERS_VIEW)).toBe(false)
    expect(hasOrgPermission({ my_permissions: null }, ORG_PERMISSIONS.MEMBERS_VIEW)).toBe(false)
  })

  it("does not take a role's word for it", () => {
    const org = { my_role: "owner", my_permissions: [] }

    expect(hasOrgPermission(org, ORG_PERMISSIONS.MEMBERS_MANAGE)).toBe(false)
  })
})

describe("useOrgPermission", () => {
  it("follows the org being acted as", () => {
    const { result } = renderHook(() => useOrgPermission(ORG_PERMISSIONS.MEMBERS_MANAGE))
    expect(result.current).toBe(false)

    act(() => {
      useAuthStore.setState({
        currentOrganization: { id: "org-1", my_permissions: ["members.manage"] } as never,
      })
    })
    expect(result.current).toBe(true)

    act(() => {
      useAuthStore.setState({
        currentOrganization: { id: "org-1", my_permissions: ["members.view"] } as never,
      })
    })
    expect(result.current).toBe(false)
  })
})

describe("orgRoleLabel", () => {
  it("names the three roles and has no word for anything else", () => {
    expect(orgRoleLabel("owner")).toBe("Owner")
    expect(orgRoleLabel("coach")).toBe("Coach")
    expect(orgRoleLabel("staff")).toBe("Staff")
    expect(orgRoleLabel("admin")).toBe("Member")
    expect(orgRoleLabel(null)).toBe("Member")
  })
})
