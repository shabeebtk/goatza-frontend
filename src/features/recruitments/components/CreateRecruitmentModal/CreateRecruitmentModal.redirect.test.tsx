// @vitest-environment jsdom
/**
 * Creating a recruitment lands on what was just made: its details page, published
 * or draft, by way of navigateAway so the wizard's history entry is gone first.
 * Driven through the real wizard. The type picker is the one thing stubbed, to
 * skip its past-recruitments fetch.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OVERLAY_STATE_KEY } from "@/shared/hooks/useBackToClose"
import CreateRecruitmentModal from "./CreateRecruitmentModal"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    create: vi.fn(),
    toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
    usePathname: () => "/organization/admin/org-1/dashboard",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("./TypePicker", () => ({
    default: ({ onPick }: { onPick: (type: string) => void }) => (
        <button type="button" onClick={() => onPick("player_looking")}>
            pick a type
        </button>
    ),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({
    useToast: () => ({ show: mocks.toast, dismiss: vi.fn() }),
}))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/features/profile/hooks/useProfileBias", () => ({ useProfileBias: () => null }))
vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
    useSportsList: () => ({ data: [{ id: "sport-1", name: "Football", positions: [] }] }),
}))
vi.mock("@/features/organization/hooks/useOrganizations", () => ({
    useOrgDetail: () => ({ data: { sports: [{ id: "sport-1", is_primary: true }] } }),
}))
vi.mock("../../hooks/useRecruitments", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../hooks/useRecruitments")>()),
    useCreateRecruitment: () => ({ mutateAsync: mocks.create }),
    useUpdateRecruitment: () => ({ mutateAsync: vi.fn() }),
    useChangeRecruitmentStatus: () => ({ mutateAsync: vi.fn() }),
    useRecruitmentsList: () => ({ data: undefined, isLoading: false }),
}))

const onCreated = vi.fn()
const depth = () => (window.history.state?.[OVERLAY_STATE_KEY]?.depth as number | undefined) ?? 0
const DETAILS = "/organization/admin/org-1/recruitments/rec-9"

function openWizard() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <CreateRecruitmentModal
                username="club"
                orgId="org-1"
                onClose={vi.fn()}
                onCreated={onCreated}
            />
        </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole("button", { name: "pick a type" }))
}

const fieldInput = (field: string) =>
    document.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)!

const next = () => fireEvent.click(screen.getByRole("button", { name: /^Next/ }))

/** Every step's required fields, up to the one with the age groups. */
function fillIn() {
    fireEvent.change(fieldInput("title"), { target: { value: "Goalkeeper wanted" } })
    next() // basics → when & where
    next() // when & where → who
    fireEvent.click(screen.getByRole("radio", { name: /Open to all ages/ }))
}

beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    onCreated.mockReset()
    mocks.create.mockResolvedValue({ recruitment_id: "rec-9" })
    window.history.replaceState(null, "")
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
})

afterEach(async () => {
    cleanup()
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
    })
    window.history.replaceState(null, "")
})

describe("after creating a recruitment", () => {
    it("a draft goes to its details page", async () => {
        openWizard()
        fillIn()
        const before = depth()
        expect(before).toBeGreaterThan(0)

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }))
        })

        await waitFor(() => expect(mocks.create).toHaveBeenCalled())
        expect(mocks.create.mock.calls[0][0].status).toBe("draft")
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAILS), { timeout: 5000 })
        expect(mocks.push).toHaveBeenCalledTimes(1)
        expect(mocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Draft saved", variant: "success" })
        )
    })

    it("published goes to its details page too", async () => {
        openWizard()
        fillIn()
        next() // who → pitch
        next() // pitch → apply
        next() // apply → publish

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Publish/ }))
        })

        await waitFor(() => expect(mocks.create).toHaveBeenCalled())
        expect(mocks.create.mock.calls[0][0].status).toBe("active")
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAILS), { timeout: 5000 })
        expect(mocks.push).toHaveBeenCalledTimes(1)
        expect(mocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Recruitment published", variant: "success" })
        )
    })

    it("the wizard's history entry has gone before the push", async () => {
        openWizard()
        fillIn()
        let depthAtPush = -1
        mocks.push.mockImplementation(() => {
            depthAtPush = depth()
        })

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }))
        })

        await waitFor(() => expect(mocks.push).toHaveBeenCalled(), { timeout: 5000 })
        expect(depthAtPush).toBe(0)
        expect(onCreated).toHaveBeenCalledWith("rec-9")
    })
})
