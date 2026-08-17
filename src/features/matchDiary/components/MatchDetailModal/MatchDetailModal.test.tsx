// @vitest-environment jsdom

/**
 * MatchDetailModal — the read, and the two ways out of it.
 *
 * What is pinned here is what the modal PROMISES rather than how it looks:
 *
 *   1. It renders the entry it is given on every render, so an edit that saves
 *      underneath shows through. This is the whole reason the page looks the
 *      match up by id instead of handing over a snapshot.
 *   2. A scheduled fixture is a different screen — no tiles, no rating, no
 *      minutes, and a primary action that says "Add result". The database
 *      enforces that a fixture carries none of those; the modal must not draw
 *      empty sockets for them.
 *   3. Deleting asks first. `useDeleteMatch` pulls the row out of the list
 *      optimistically, so a mis-tapped trash icon is a row vanishing from under
 *      somebody — the confirm is the only thing standing in front of it.
 *   4. Escape and the backdrop both close, because a modal you can only leave
 *      by finding the ✕ is a modal somebody is stuck in.
 *
 * The data layer is mocked. `useDeleteMatch` is tested where it lives, and a
 * real QueryClient here would only add ways for this to fail for reasons that
 * have nothing to do with the screen.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { MatchEntry, MatchEntryStat } from "../../types"
import MatchDetailModal from "./MatchDetailModal"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

const deleteMutate = vi.fn().mockResolvedValue(undefined)

vi.mock("../../hooks/useMatchDiary", () => ({
    useDeleteMatch: () => ({ mutateAsync: deleteMutate, isPending: false }),
}))

const showToast = vi.fn()

vi.mock("@/shared/components/ui/Toast/Toast", () => ({
    useToast: () => ({ show: showToast, dismiss: vi.fn(), dismissAll: vi.fn() }),
}))

afterEach(() => {
    cleanup()
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

describe("reading a match", () => {
    it("names the match, the day and the kick-off", () => {
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
        expect(screen.getByText("How you felt you played")).toBeTruthy()
        expect(screen.getByText("Left wing")).toBeTruthy()
        expect(screen.getByText("60")).toBeTruthy()
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
        expect(screen.getByText("90")).toBeTruthy()
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
        expect(screen.queryByText("Minutes")).toBeNull()
        expect(screen.queryByText("Position")).toBeNull()
        expect(screen.queryByText("Playing for")).toBeNull()
        expect(modal().querySelector("img")).toBeNull()

        // The one row that always has a value stays.
        expect(screen.getByText("Type")).toBeTruthy()
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
        expect(screen.queryByText("Minutes")).toBeNull()
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

        // The page decides what "edit" means — hiding this modal while keeping
        // the match it was reading, so closing the sheet lands back here.
        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe("deleting", () => {
    it("asks before it deletes", async () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Delete match" }))

        // The trash icon on its own deletes NOTHING. `useDeleteMatch` pulls the
        // row from the list optimistically, so a mis-tap would be a match
        // disappearing under somebody with no warning.
        expect(deleteMutate).not.toHaveBeenCalled()
        expect(screen.getByText("Delete this match?")).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Delete" }))

        await vi.waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("match-1"))
        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())

        expect(showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Match deleted" })
        )
    })

    it("backs out of the confirm without deleting", () => {
        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Delete match" }))
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

        expect(deleteMutate).not.toHaveBeenCalled()
        expect(screen.queryByText("Delete this match?")).toBeNull()
        expect(screen.getByRole("button", { name: "Edit match" })).toBeTruthy()
    })

    it("lets Escape leave the confirm before it leaves the modal", () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Delete match" }))
        fireEvent.keyDown(window, { key: "Escape" })

        expect(screen.queryByText("Delete this match?")).toBeNull()
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.keyDown(window, { key: "Escape" })
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})

describe("closing", () => {
    it("closes on Escape", () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.keyDown(window, { key: "Escape" })
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("closes on a backdrop click, but not on a click inside the dialog", () => {
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
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.click(dialog.parentElement as HTMLElement)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("closes on the ✕", () => {
        const onClose = vi.fn()

        render(
            <MatchDetailModal
                entry={makeEntry()}
                onEdit={vi.fn()}
                onClose={onClose}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
