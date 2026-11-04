// @vitest-environment jsdom
/**
 * The "Saved" toast: the only confirmation a save gets, so it must fire from the
 * mutation itself (the ⋯ sheet unmounts right after the tap) and its View must
 * open the saved page of whoever is acting.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { useToggleSave } from "./usePostMutations"

const mocks = vi.hoisted(() => ({
    savePostApi: vi.fn(),
    show: vi.fn(),
    push: vi.fn(),
}))

vi.mock("../services/posts.api", () => ({
    savePostApi: (...args: unknown[]) => mocks.savePostApi(...args),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({
    useToast: () => ({ show: mocks.show }),
}))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

async function save(isSaved: boolean) {
    mocks.savePostApi.mockResolvedValue({ is_saved: isSaved })
    const hook = renderHook(() => useToggleSave(), { wrapper })
    await act(async () => {
        hook.result.current.mutate({ post_id: "p-1" })
    })
    await waitFor(() => expect(mocks.show).toHaveBeenCalled())
    return { ...hook, toast: mocks.show.mock.calls[0][0] }
}

beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    useAuthStore.setState({ actorType: "user", actorId: null })
})

describe("useToggleSave", () => {
    it("saved: the title, the icon, no body, a View action, 2.5 s", async () => {
        const { toast } = await save(true)

        expect(toast).toMatchObject({ title: "Saved", icon: "mdi:bookmark", duration: 2500 })
        expect(toast.message).toBeUndefined()
        expect(toast.action.label).toBe("View")
    })

    it("unsaved: its own title and icon, 2 s, nothing to view", async () => {
        const { toast } = await save(false)

        expect(toast).toMatchObject({
            title: "Removed from saved",
            icon: "mdi:bookmark-remove-outline",
            duration: 2000,
        })
        expect(toast.action).toBeUndefined()
    })

    it("View opens the person's saved page", async () => {
        const { toast } = await save(true)

        toast.action.onClick()

        expect(mocks.push).toHaveBeenCalledWith("/settings/saved")
    })

    it("View opens the organization's saved page while acting as one", async () => {
        useAuthStore.setState({ actorType: "organization", actorId: "org-1" })
        const { toast } = await save(true)

        toast.action.onClick()

        expect(mocks.push).toHaveBeenCalledWith("/organization/admin/org-1/saved")
    })

    it("View reads the actor at the tap, not at the save", async () => {
        const { toast } = await save(true)
        useAuthStore.setState({ actorType: "organization", actorId: "org-2" })

        toast.action.onClick()

        expect(mocks.push).toHaveBeenCalledWith("/organization/admin/org-2/saved")
    })

    it("still fires if the component that tapped has already unmounted", async () => {
        let resolve: (value: { is_saved: boolean }) => void = () => {}
        mocks.savePostApi.mockImplementation(() => new Promise((r) => (resolve = r)))
        const hook = renderHook(() => useToggleSave(), { wrapper })
        await act(async () => {
            hook.result.current.mutate({ post_id: "p-1" })
        })

        hook.unmount()
        await act(async () => resolve({ is_saved: true }))

        await waitFor(() => expect(mocks.show).toHaveBeenCalled())
        expect(mocks.show.mock.calls[0][0].title).toBe("Saved")
    })

    it("a failure says so instead", async () => {
        mocks.savePostApi.mockRejectedValue(new Error("offline"))
        const hook = renderHook(() => useToggleSave(), { wrapper })
        await act(async () => {
            hook.result.current.mutate({ post_id: "p-1" })
        })

        await waitFor(() => expect(mocks.show).toHaveBeenCalled())
        expect(mocks.show.mock.calls[0][0]).toMatchObject({
            title: "Couldn't update your saved posts",
            variant: "error",
        })
    })
})
