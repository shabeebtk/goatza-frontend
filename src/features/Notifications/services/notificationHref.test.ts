import { describe, expect, it } from "vitest"

import { resolveNotificationHref } from "./notificationHref"

describe("resolveNotificationHref", () => {
    it("passes a relative path through untouched", () => {
        expect(resolveNotificationHref("/posts/abc")).toBe("/posts/abc")
        expect(
            resolveNotificationHref("/organization/admin/1/verifications?tab=achievements")
        ).toBe("/organization/admin/1/verifications?tab=achievements")
        expect(resolveNotificationHref("/profile/alice#career")).toBe(
            "/profile/alice#career"
        )
    })

    it("falls back when there is no url", () => {
        expect(resolveNotificationHref()).toBe("/notifications")
        expect(resolveNotificationHref(null)).toBe("/notifications")
        expect(resolveNotificationHref("")).toBe("/notifications")
    })

    it("refuses anything that could leave the origin", () => {
        // `url` arrives via an FCM data payload, which is not a trusted channel.
        expect(resolveNotificationHref("//evil.com/posts/abc")).toBe("/notifications")
        expect(resolveNotificationHref("/\\evil.com")).toBe("/notifications")
        expect(resolveNotificationHref("https://evil.com")).toBe("/notifications")
        expect(resolveNotificationHref("javascript:alert(1)")).toBe("/notifications")
        expect(resolveNotificationHref("posts/abc")).toBe("/notifications")
    })
})
