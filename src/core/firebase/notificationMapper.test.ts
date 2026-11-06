import { describe, expect, it, vi } from "vitest"

import { handleNotificationToast } from "./notificationMapper"

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
