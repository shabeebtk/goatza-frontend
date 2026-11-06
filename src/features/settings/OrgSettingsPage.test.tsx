// @vitest-environment jsdom
/**
 * The privacy toggle is decided by my_permissions, not by my_role.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import OrgSettingsPage from "./OrgSettingsPage"

const mocks = vi.hoisted(() => ({ org: null as unknown }))

vi.mock("@/features/organization/hooks/useOrganizations", () => ({
  useOrgDetail: () => ({ data: mocks.org }),
}))
vi.mock("./hooks/usePrivacySettings", () => ({
  useToggleOrgPublicProfile: () => ({ isPending: false, mutate: vi.fn() }),
}))
vi.mock("@/shared/components/ui", () => ({ BackHeader: () => null }))
vi.mock("@/features/support/components/ProblemReportSheet/ProblemReportSheet", () => ({
  default: () => null,
}))
vi.mock("./components/SettingsMenu/ProfileLinkRow", () => ({ default: () => null }))
vi.mock("./components/SettingsMenu/SettingsMenu", () => ({
  SettingsSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsActionRow: () => null,
  SettingsRow: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
  SettingsToggleRow: ({ label, disabled, hint }: { label: string; disabled: boolean; hint: string }) => (
    <button disabled={disabled} title={hint}>
      {label}
    </button>
  ),
}))

const toggle = () => screen.getByRole("button", { name: "Public profile" }) as HTMLButtonElement

beforeEach(() => {
  mocks.org = null
})

afterEach(cleanup)

describe("OrgSettingsPage", () => {
  it("enables the toggle with org.privacy", () => {
    mocks.org = { my_role: "coach", my_permissions: ["org.privacy"] }
    render(<OrgSettingsPage orgId="org-1" />)

    expect(toggle().disabled).toBe(false)
  })

  it("disables it without org.privacy, whatever the role is called", () => {
    mocks.org = { my_role: "owner", my_permissions: ["members.view"] }
    render(<OrgSettingsPage orgId="org-1" />)

    expect(toggle().disabled).toBe(true)
    expect(toggle().title).toBe("Only an owner can change this")
  })

  it("links to the members page", () => {
    render(<OrgSettingsPage orgId="org-1" />)

    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/members"
    )
  })
})
