/**
 * The page and enquiry permissions. These strings are the server's
 * (apps/organization/permissions.py): a typo here hides the nav item, the editor
 * and the inbox from everyone who should have them.
 */

import { describe, expect, it } from "vitest"

import { ORG_PERMISSIONS, hasOrgPermission } from "./orgPermissions"

describe("The page permissions", () => {
  it("are named exactly as the server names them", () => {
    expect(ORG_PERMISSIONS.PAGE_MANAGE).toBe("page.manage")
    expect(ORG_PERMISSIONS.ENQUIRIES_MANAGE).toBe("enquiries.manage")
  })

  it("are read from my_permissions, never from a role", () => {
    const staff = { my_role: "staff", my_permissions: ["members.view", "page.manage", "enquiries.manage"] }
    const ownerWithout = { my_role: "owner", my_permissions: ["members.view"] }

    expect(hasOrgPermission(staff, ORG_PERMISSIONS.PAGE_MANAGE)).toBe(true)
    expect(hasOrgPermission(staff, ORG_PERMISSIONS.ENQUIRIES_MANAGE)).toBe(true)
    expect(hasOrgPermission(ownerWithout, ORG_PERMISSIONS.PAGE_MANAGE)).toBe(false)
    expect(hasOrgPermission(ownerWithout, ORG_PERMISSIONS.ENQUIRIES_MANAGE)).toBe(false)
  })
})
