// @vitest-environment jsdom
/**
 * OrgNav no longer sends a new recruitment to the list: the wizard goes to the
 * recruitment itself, and a push here would race that navigation and win.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import OrgNav from "./OrgNav"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    trigger: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    usePathname: () => "/organization/admin/org-1/dashboard",
    useRouter: () => ({ push: mocks.push }),
}))
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/features/auth/hooks/useLogout", () => ({
    LOGOUT_CONFIRM: {},
    useLogout: () => vi.fn(),
}))
vi.mock("@/features/Notifications/hooks/useNotificationQueries", () => ({
    useUnreadCount: () => ({ data: { count: 0 } }),
}))
vi.mock("@/features/messages/hooks/useConversationQueries", () => ({
    useConversationsUnreadSummary: () => ({ data: { total: 0 } }),
}))
vi.mock("@/shared/components/layout/AccountSwitcher/AccountSwitcher", () => ({ default: () => null }))
vi.mock("@/shared/components/layout/CreateMenu/CreateMenu", () => ({ default: () => null }))
vi.mock("@/shared/components/layout/MobileNavSheet/MobileNavSheet", () => ({ default: () => null }))
vi.mock("@/shared/components/layout/NavMoreMenu/NavMoreMenu", () => ({ default: () => null }))
vi.mock("@/features/posts/components/CreatePostModal/CreatePostModal", () => ({ default: () => null }))
vi.mock("@/features/recruitments/components/CreateRecruitmentModal/CreateRecruitmentTrigger", () => ({
    default: (props: { onCreated?: (id: string) => void; open?: boolean }) => {
        mocks.trigger(props)
        return <div data-testid="trigger" />
    },
}))

beforeEach(() => {
    mocks.push.mockReset()
    mocks.trigger.mockReset()
    useAuthStore.setState({
        user: { id: "u1", username: "owner" } as never,
        actorType: "organization",
        actorId: "org-1",
        organizations: [{ id: "org-1", username: "club", name: "Club" }] as never,
        currentOrganization: { id: "org-1", username: "club", name: "Club" } as never,
    })
})

afterEach(cleanup)

describe("OrgNav", () => {
    it("hands the recruitment trigger no onCreated: nothing to race the wizard with", () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <OrgNav orgId="org-1" />
            </QueryClientProvider>
        )

        expect(screen.getByTestId("trigger")).toBeTruthy()
        const props = mocks.trigger.mock.lastCall![0]
        expect(props.onCreated).toBeUndefined()
        expect(mocks.push).not.toHaveBeenCalled()
    })
})
