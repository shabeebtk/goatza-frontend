import { describe, expect, it, vi } from "vitest"

import { handleNotificationToast, queriesToRefresh } from "./notificationMapper"

describe("Org-member pushes in the foreground", () => {
  it.each([
    ["org_invite", "View invite", "/notifications"],
    ["org_invite_accepted", "View members", "/organization/admin/o/members"],
    ["org_invite_declined", "View members", "/organization/admin/o/members"],
    ["org_member_removed", "View", "/home"],
    ["org_role_changed", "View members", "/organization/admin/o/members"],
    ["org_owner_changed", "View members", "/organization/admin/o/members"],
  ])("%s gets an action to the backend's url", (type, label, url) => {
    const show = vi.fn()
    const navigate = vi.fn()

    handleNotificationToast(
      { type, url, title: "Title", body: "Body" },
      { show, dismiss: vi.fn(), dismissAll: vi.fn() },
      navigate
    )

    const toast = show.mock.calls[0][0]
    expect(toast.title).toBe("Title")
    expect(toast.action.label).toBe(label)
    expect(toast.icon).not.toBe("mdi:bell")

    toast.action.onClick()
    expect(navigate).toHaveBeenCalledWith(url)
  })
})

describe("A new enquiry in the foreground", () => {
  it("is an info toast for 6 s whose Open goes to the server's url", () => {
    const show = vi.fn()
    const navigate = vi.fn()
    const url = "/organization/admin/org-1/enquiries/enq-1"

    handleNotificationToast(
      { type: "enquiry_received", url, title: "New enquiry", body: "New enquiry: Aditya, 11 · U12 Football Foundation" },
      { show, dismiss: vi.fn(), dismissAll: vi.fn() },
      navigate
    )

    const toast = show.mock.calls[0][0]
    expect(toast).toMatchObject({
      variant: "info",
      duration: 6000,
      icon: "mdi:inbox-arrow-down-outline",
      message: "New enquiry: Aditya, 11 · U12 Football Foundation",
    })
    expect(toast.action.label).toBe("Open")
    toast.action.onClick()
    expect(navigate).toHaveBeenCalledWith(url)
  })

  it("makes every enquiries query stale, and nothing for other types", () => {
    expect(queriesToRefresh("enquiry_received")).toEqual([["enquiries"]])
    expect(queriesToRefresh("squad_join_request")).toEqual([])
    expect(queriesToRefresh(undefined)).toEqual([])
  })
})
