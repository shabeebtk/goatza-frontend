// @vitest-environment jsdom

/**
 * MatchDetailModal — the read, and the ways out of it.
 *
 * What is pinned here is what the modal PROMISES rather than how it looks:
 *
 *   1. It renders the entry it is given on every render, so an edit that saves
 *      underneath shows through.
 *   2. A scheduled fixture is a different screen — no tiles, no rating, no
 *      minutes, and a primary action that says "Add result". The database
 *      enforces that a fixture carries none of those; the modal must not draw
 *      empty sockets for them.
 *   3. Deleting asks first, stays open while the request runs, closes only on
 *      success, and on failure says why in place.
 *   4. Every close goes through the history entry, so one back press closes this
 *      and nothing else. Those closes land on popstate, so they are awaited.
 *
 * The data layer is mocked. `useDeleteMatch` is tested where it lives, and a
 * real QueryClient here would only add ways for this to fail for reasons that
 * have nothing to do with the screen.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { MatchEntry, MatchEntryStat } from "../../types"
import MatchDetailModal from "./MatchDetailModal"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/shared/components/ImageLightbox/MediaLightbox", () => ({
    default: ({
        media,
        onClose,
    }: {
        media: { file_url: string }[]
        onClose: () => void
    }) => (
        <div data-testid="lightbox" data-src={media[0].file_url}>
            <button type="button" onClick={onClose}>
                Close photo
            </button>
        </div>
    ),
}))

const deleteMutate = vi.fn().mockResolvedValue(undefined)

vi.mock("../../hooks/useMatchDiary", () => ({
    useDeleteMatch: () => ({ mutateAsync: deleteMutate, isPending: false }),
}))

const showToast = vi.fn()

vi.mock("@/shared/components/ui/Toast/Toast", () => ({
    useToast: () => ({ show: showToast, dismiss: vi.fn(), dismissAll: vi.fn() }),
}))

afterEach(async () => {
    cleanup()
    // jsdom keeps one history for the whole file. Let a pop still in flight land,
    // then wipe the entry we are left on so the next test starts at depth 0.
    await new Promise((resolve) => setTimeout(resolve, 20))
    window.history.replaceState(null, "")
    deleteMutate.mockClear()
    showToast.mockClear()
})

/**
 * The modal renders through `Portal` into <body>, NOT into the container
 * testing-library hands back — so an assertion made against `container` here
 * would pass against an empty div and prove nothing. Everything reads the
 * document, the same place `screen` looks.
 */
const modal = () => document.body

const stat = (
    name: string,
    value: number,
    overrides: Partial<MatchEntryStat> = {}
): MatchEntryStat => ({
    stat_field_id: `stat-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    short_label: name.slice(0, 2).toUpperCase(),
    unit: "",
    value_type: "integer",
    is_primary: false,
    value,
    ...overrides,
})

const makeEntry = (overrides: Partial<MatchEntry> = {}): MatchEntry => ({
    id: "match-1",
    sport: { id: "sport-1", name: "Football", icon_name: "", icon_url: "" },
    status: "played",
    date: "2026-08-15",
    kickoff_time: "16:00:00",
    opponent_name: "Kannur FC",
    match_type: "school_college",
    result: "win",
    minutes_played: 60,
    position: { id: "pos-lw", name: "Left wing" },
    self_rating: 4,
    notes: "",
    career_entry: null,
    photo_url: "",
    stats: [stat("Goals", 2, { is_primary: true })],
    created_at: "2026-08-15T10:00:00Z",
    updated_at: "2026-08-15T10:00:00Z",
    ...overrides,
})

/** The trash icon, then the ConfirmDialog's own Delete. */
const confirmDelete = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete match" }))
    expect(deleteMutate).not.toHaveBeenCalled()

    const dialog = screen.getByRole("alertdialog")
    fireEvent.click(
        Array.from(dialog.querySelectorAll("button")).find(
            (button) => button.textContent === "Delete"
        ) as HTMLButtonElement
    )
    await vi.waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("match-1"))
}

describe("reading a match", () => {
    it("names the match, the day, the kick-off and one meta line", () => {
        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        const dialog = screen.getByRole("dialog")
        expect(dialog.getAttribute("aria-modal")).toBe("true")
        // The heading the dialog is labelled by is the opponent.
        expect(
            document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")
                ?.textContent
        ).toBe("Kannur FC")

        expect(
            screen.getByText("Saturday 15 August 2026 · 16:00 kick-off")
        ).toBeTruthy()
        expect(screen.getByText("Won")).toBeTruthy()
        expect(screen.getByText("School / College · 60′ · Left wing")).toBeTruthy()
        expect(screen.getByText("How you felt you played")).toBeTruthy()
    })

    it("titles a match with no opponent 'Match'", () => {
        render(
            <MatchDetailModal
                entry={makeEntry({ opponent_name: "  " })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByRole("heading", { name: "Match" })).toBeTruthy()
    })

    it("drops the kick-off clause when there is no time on the entry", () => {
        render(
            <MatchDetailModal
                entry={makeEntry({ kickoff_time: null })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByText("Saturday 15 August 2026")).toBeTruthy()
    })

    it("reads a cricket ball count back as overs", () => {
        render(
            <MatchDetailModal
                entry={makeEntry({
                    stats: [stat("Balls bowled", 27)],
                })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        // 27 balls is four overs and three balls. The catalog stores balls
        // because overs do not sum as decimals; this is where that is undone.
        expect(modal().textContent).toContain("4.3")
        expect(modal().textContent).toContain("Overs")
        expect(modal().textContent).not.toContain("27")
    })

    it("shows the entry it is handed on every render, so an edit shows through", () => {
        const { rerender } = render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByText("Kannur FC")).toBeTruthy()
        expect(screen.getByText("Won")).toBeTruthy()

        // The same match as the list now holds it, after the sheet saved.
        rerender(
            <MatchDetailModal
                entry={makeEntry({
                    opponent_name: "Kannur FC Reserves",
                    result: "loss",
                    minutes_played: 90,
                    notes: "Second half only.",
                })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByText("Kannur FC Reserves")).toBeTruthy()
        expect(screen.getByText("Lost")).toBeTruthy()
        expect(screen.getByText(/90′/)).toBeTruthy()
        expect(screen.getByText("Second half only.")).toBeTruthy()
        expect(screen.queryByText("Won")).toBeNull()
    })

    it("renders no empty sections for a match with nothing attached", () => {
        render(
            <MatchDetailModal
                entry={makeEntry({
                    result: "na",
                    stats: [],
                    self_rating: null,
                    minutes_played: null,
                    position: null,
                    career_entry: null,
                    notes: "",
                    photo_url: "",
                })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        // `na` prints NO chip — "Not applicable" is a database value.
        expect(screen.queryByText("Won")).toBeNull()
        expect(screen.queryByText("Lost")).toBeNull()
        expect(screen.queryByText("Drawn")).toBeNull()
        expect(screen.queryByText(/not applicable/i)).toBeNull()

        expect(screen.queryByText("How you felt you played")).toBeNull()
        expect(screen.queryByText("Your note")).toBeNull()
        expect(screen.queryByText("Playing for")).toBeNull()
        expect(modal().querySelector("img")).toBeNull()

        // The one thing that always has a value stays.
        expect(screen.getByText("School / College")).toBeTruthy()
    })

    it("opens the photo full size", () => {
        render(
            <MatchDetailModal
                entry={makeEntry({ photo_url: "https://example.test/photo.jpg" })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.queryByTestId("lightbox")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "View photo full size" }))

        expect(screen.getByTestId("lightbox").getAttribute("data-src")).toBe(
            "https://example.test/photo.jpg"
        )
    })

    it("keeps the verified club tick, on a verified stint only", () => {
        const stint = {
            id: "career-1",
            title: "Striker",
            organization_name: "Riverside FC",
        }
        const { unmount } = render(
            <MatchDetailModal
                entry={makeEntry({
                    career_entry: { ...stint, verification_status: "pending" },
                })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByText("Riverside FC")).toBeTruthy()
        expect(screen.queryByLabelText("Verified")).toBeNull()
        unmount()

        render(
            <MatchDetailModal
                entry={makeEntry({
                    career_entry: { ...stint, verification_status: "verified" },
                })}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByLabelText("Verified")).toBeTruthy()
    })
})

describe("a scheduled fixture", () => {
    const fixture = makeEntry({
        status: "scheduled",
        result: "na",
        minutes_played: null,
        self_rating: null,
        stats: [],
    })

    it("renders no tiles, no rating and no minutes, and offers to add the result", () => {
        render(
            <MatchDetailModal
                entry={fixture}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        expect(screen.getByText("Scheduled")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Add result" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Edit match" })).toBeNull()

        expect(screen.queryByText("How you felt you played")).toBeNull()
        expect(screen.queryByText(/′/)).toBeNull()
        expect(screen.queryByText("Goals")).toBeNull()
        expect(modal().querySelector('[data-icon="mdi:star"]')).toBeNull()
    })

    it("hands over to the edit sheet without closing itself", () => {
        const onEdit = vi.fn()
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={fixture}
                onEdit={onEdit}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Add result" }))

        // The page decides what "edit" means. This modal stays mounted under the
        // sheet, so closing the sheet lands back here.
        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe("deleting", () => {
    it("asks first, and closes with a toast once the delete has succeeded", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        await confirmDelete()

        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Match deleted", variant: "success" })
        )
    })

    it("stays open and shows the pending state until the request answers", async () => {
        let resolveDelete: () => void = () => {}
        deleteMutate.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                resolveDelete = resolve
            })
        )
        const onClose = vi.fn()
        const onDeletingChange = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
                onDeletingChange={onDeletingChange}
            />
        )

        await confirmDelete()

        // The row has left the list by now. The modal must not go with it.
        expect(await screen.findByText("Deleting…")).toBeTruthy()
        expect(onDeletingChange).toHaveBeenCalledWith(true)
        expect(onClose).not.toHaveBeenCalled()
        expect(
            (screen.getByRole("button", { name: "Close" }) as HTMLButtonElement)
                .disabled
        ).toBe(true)

        // The trash button only says it is unavailable, and ignores a press.
        const trash = screen.getByRole("button", {
            name: "Delete match",
        }) as HTMLButtonElement
        expect(trash.disabled).toBe(false)
        expect(trash.getAttribute("aria-disabled")).toBe("true")
        fireEvent.click(trash)
        expect(screen.queryByRole("alertdialog")).toBeNull()

        // Nor can Esc, the backdrop or a back press close it from under the request.
        fireEvent.keyDown(window, { key: "Escape" })
        fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement)
        act(() => window.history.back())
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText("Deleting…")).toBeTruthy()

        resolveDelete()

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("shows the error in place on a failure, and stays open", async () => {
        deleteMutate.mockRejectedValueOnce(new Error("Nope"))
        const onClose = vi.fn()
        const onDeletingChange = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
                onDeletingChange={onDeletingChange}
            />
        )

        await confirmDelete()

        const error = await screen.findByRole("alert")
        expect(error.textContent).toContain("Nope")
        expect(onClose).not.toHaveBeenCalled()
        expect(onDeletingChange).toHaveBeenLastCalledWith(false)

        // Back to normal, and the hook is what toasts, so this does not again.
        expect(screen.getByRole("button", { name: "Edit match" })).toBeTruthy()
        expect(showToast).not.toHaveBeenCalled()
    })

    it("gets focus back from the confirm, and keeps it after a failure", async () => {
        deleteMutate.mockRejectedValueOnce(new Error("Nope"))

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        const trash = screen.getByRole("button", { name: "Delete match" })
        trash.focus()

        await confirmDelete()
        await screen.findByRole("alert")

        // Not <body>, which is where it lands if this button was disabled when
        // the confirm handed focus back.
        expect(document.activeElement).toBe(trash)
        expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
            true
        )
    })

    it("backs out of the confirm without deleting", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Delete match" }))
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

        await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(deleteMutate).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Edit match" })).toBeTruthy()
    })

    it("lets Escape leave the confirm before it leaves the modal", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Delete match" }))
        fireEvent.keyDown(document, { key: "Escape" })

        await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.keyDown(window, { key: "Escape" })
        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
})

describe("closing", () => {
    it("closes on Escape", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.keyDown(window, { key: "Escape" })
        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("leaves Escape alone while the sheet is open on top of it", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                covered
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.keyDown(window, { key: "Escape" })
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(onClose).not.toHaveBeenCalled()
    })

    it("closes on a back press", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        act(() => window.history.back())

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("closes on a backdrop click, but not on a click inside the dialog", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        const dialog = screen.getByRole("dialog")

        fireEvent.click(dialog)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.click(dialog.parentElement as HTMLElement)
        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("closes on the ✕", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
})
