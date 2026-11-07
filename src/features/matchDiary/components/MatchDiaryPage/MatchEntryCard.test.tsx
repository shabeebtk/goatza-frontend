// @vitest-environment jsdom

/**
 * MatchEntryCard — what the card shows, and what it refuses to show.
 *
 * Most of what is worth pinning here is the failure a compact card invites: one
 * that invents something. An absent stat rendered as "0", a letter on a match
 * with no result, an empty note line — each of those is a number or a claim the
 * player never entered, and each is cheap to reintroduce.
 *
 * Layout is not tested. jsdom has no layout, so an assertion about a truncated
 * line or a card's height would only be testing the class name.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { MatchEntry, MatchEntryStat } from "../../types"
import { MatchEntryCard } from "./MatchEntryCard"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

afterEach(cleanup)

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
    kickoff_time: null,
    opponent_name: "Kannur FC",
    match_type: "league",
    result: "win",
    minutes_played: 60,
    position: { id: "pos-lw", name: "Left wing" },
    self_rating: 4,
    notes: "",
    career_entry: null,
    photo_url: "",
    stats: [],
    created_at: "2026-08-15T10:00:00Z",
    updated_at: "2026-08-15T10:00:00Z",
    ...overrides,
})

describe("the compact layout", () => {
    it("is a result badge, the opponent and one meta line", () => {
        render(<MatchEntryCard entry={makeEntry()} onOpen={vi.fn()} />)

        expect(screen.getByRole("img", { name: "Won" }).textContent).toBe("W")
        expect(screen.getByText("Kannur FC")).toBeTruthy()
        expect(screen.getByText("15 Aug · League · 60′")).toBeTruthy()
    })

    it.each([
        ["win", "W", "Won"],
        ["draw", "D", "Drawn"],
        ["loss", "L", "Lost"],
    ] as const)("reads a %s without relying on colour", (result, letter, name) => {
        render(<MatchEntryCard entry={makeEntry({ result })} onOpen={vi.fn()} />)

        expect(screen.getByRole("img", { name }).textContent).toBe(letter)
    })

    it("titles a match with no opponent 'Match'", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({ opponent_name: " " })}
                onOpen={vi.fn()}
            />
        )

        expect(screen.getByText("Match")).toBeTruthy()
    })

    it("shows the logged stats on one line, in the singular at one", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({
                    stats: [
                        stat("Goals", 2),
                        stat("Assists", 1),
                        stat("Shots on target", 1),
                    ],
                })}
                onOpen={vi.fn()}
            />
        )

        expect(
            screen.getByText("2 Goals · 1 Assist · 1 Shot on target")
        ).toBeTruthy()
        // A stat the player did not log is ABSENT, not zero.
        expect(screen.queryByText(/\b0\b/)).toBeNull()
    })

    it("trims a decimal column back to the number that was entered", () => {
        const { container } = render(
            <MatchEntryCard
                entry={makeEntry({
                    minutes_played: null,
                    stats: [
                        // Every value arrives as a decimal, integer stats
                        // included — 2.00 must read as "2", never "2.00".
                        stat("Goals", 2.0),
                        stat("Distance covered", 10.5, {
                            value_type: "decimal",
                            unit: "km",
                        }),
                    ],
                })}
                onOpen={vi.fn()}
            />
        )

        expect(container.textContent).toContain("2 Goals")
        expect(container.textContent).not.toContain("2.00")
        expect(container.textContent).toContain("10.5km")
    })

    it("caps the line at three, primaries first, and counts the rest into +N", () => {
        const stats = [
            ...Array.from({ length: 10 }, (_, index) =>
                stat(`Filler ${index}`, index + 2)
            ),
            stat("Goals", 3, { is_primary: true }),
            stat("Assists", 2, { is_primary: true }),
        ]

        render(<MatchEntryCard entry={makeEntry({ stats })} onOpen={vi.fn()} />)

        // Primaries win a slot however far down the API returned them, then the
        // API's own order fills what is left.
        expect(
            screen.getByText("3 Goals · 2 Assists · 2 Filler 0")
        ).toBeTruthy()
        expect(screen.getByText("+9")).toBeTruthy()
    })

    it("draws no +N when everything fits", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({ stats: [stat("Goals", 2)] })}
                onOpen={vi.fn()}
            />
        )

        expect(screen.queryByText(/^\+\d/)).toBeNull()
    })

    it("names the button with one sentence and opens the match", () => {
        const onOpen = vi.fn()
        const entry = makeEntry()

        render(<MatchEntryCard entry={entry} onOpen={onOpen} />)

        fireEvent.click(
            screen.getByRole("button", {
                name: "Won — Kannur FC, 15 August 2026. League, 60 minutes",
            })
        )
        expect(onOpen).toHaveBeenCalledWith(entry)
    })

    it("says everything the card shows, because the name replaces its contents", () => {
        const stats = [
            ...Array.from({ length: 4 }, (_, index) =>
                stat(`Filler ${index}`, index + 2)
            ),
            stat("Goals", 3, { is_primary: true }),
            stat("Assists", 1, { is_primary: true }),
        ]

        render(
            <MatchEntryCard
                entry={makeEntry({
                    minutes_played: 1,
                    stats,
                    career_entry: {
                        id: "career-1",
                        title: "Striker",
                        organization_name: "Riverside FC",
                        verification_status: "verified",
                    },
                })}
                onOpen={vi.fn()}
            />
        )

        // "1 minute", "and 3 more", ", verified": the visible "1′", "+3" and tick
        // would not read aloud as anything.
        expect(
            screen.getByRole("button", {
                name:
                    "Won — Kannur FC, 15 August 2026. League, 1 minute. " +
                    "3 Goals, 1 Assist, 2 Filler 0 and 3 more. " +
                    "Playing for Riverside FC, verified",
            })
        ).toBeTruthy()
    })

    it("does not say verified for a stint that is only claimed", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({
                    career_entry: {
                        id: "career-1",
                        title: "Striker",
                        organization_name: "Riverside FC",
                        verification_status: "pending",
                    },
                })}
                onOpen={vi.fn()}
            />
        )

        expect(
            screen.getByRole("button", {
                name: "Won — Kannur FC, 15 August 2026. League, 60 minutes. Playing for Riverside FC",
            })
        ).toBeTruthy()
    })

    it("leaves the note to a description, read from the line on the card", () => {
        const note = "Cut inside on the right back all game."

        const { unmount } = render(
            <MatchEntryCard entry={makeEntry({ notes: note })} onOpen={vi.fn()} />
        )

        expect(screen.getByRole("button", { description: note })).toBeTruthy()
        expect(screen.getByRole("button").getAttribute("aria-label")).not.toContain(
            note
        )
        unmount()

        render(<MatchEntryCard entry={makeEntry()} onOpen={vi.fn()} />)

        expect(screen.getByRole("button").hasAttribute("aria-describedby")).toBe(
            false
        )
    })

    it("ticks a verified career stint and nothing else", () => {
        const { container, unmount } = render(
            <MatchEntryCard
                entry={makeEntry({
                    career_entry: {
                        id: "career-1",
                        title: "Striker",
                        organization_name: "Riverside FC",
                        verification_status: "pending",
                    },
                })}
                onOpen={vi.fn()}
            />
        )

        expect(screen.getByText("Riverside FC")).toBeTruthy()
        expect(container.querySelector('[data-icon="mdi:check-decagram"]')).toBeNull()

        unmount()

        const verified = render(
            <MatchEntryCard
                entry={makeEntry({
                    career_entry: {
                        id: "career-1",
                        title: "Striker",
                        organization_name: "Riverside FC",
                        verification_status: "verified",
                    },
                })}
                onOpen={vi.fn()}
            />
        )

        expect(
            verified.container.querySelector('[data-icon="mdi:check-decagram"]')
        ).toBeTruthy()
    })
})

describe("what the card refuses to render", () => {
    it("claims no result for an `na` match", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({ result: "na" })}
                onOpen={vi.fn()}
            />
        )

        // "Not applicable" is a database value. A friendly nobody kept score in
        // has no result, and the badge says so without a letter.
        expect(screen.queryByText(/not applicable/i)).toBeNull()
        expect(screen.getByRole("img", { name: "No result" }).textContent).toBe("–")
        expect(
            screen.getByRole("button", { name: /^Logged — Kannur FC/ })
        ).toBeTruthy()
    })

    it("renders no empty lines for a match with nothing but an opponent", () => {
        const { container } = render(
            <MatchEntryCard
                entry={makeEntry({
                    result: "na",
                    minutes_played: null,
                    position: null,
                    self_rating: null,
                    stats: [],
                    notes: "",
                    photo_url: "",
                })}
                onOpen={vi.fn()}
            />
        )

        expect(container.querySelector("img")).toBeNull()
        expect(screen.getByText("15 Aug · League")).toBeTruthy()
        // No stars at all: the rating lives in the detail modal.
        expect(container.querySelector('[data-icon="mdi:star"]')).toBeNull()
        expect(container.querySelector('[data-icon="mdi:star-outline"]')).toBeNull()
    })

    it("marks a scheduled fixture and claims no result", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({
                    status: "scheduled",
                    result: "na",
                    minutes_played: null,
                    self_rating: null,
                    stats: [],
                })}
                onOpen={vi.fn()}
            />
        )

        expect(screen.getByText("Scheduled")).toBeTruthy()
        expect(screen.queryByRole("img", { name: "Won" })).toBeNull()
    })

    it("shows the note and the photo only when there is one", () => {
        const { container, unmount } = render(
            <MatchEntryCard
                entry={makeEntry({ notes: "   " })}
                onOpen={vi.fn()}
            />
        )

        // Whitespace is not a note, and there is no photo either.
        expect(container.querySelector("img")).toBeNull()

        unmount()

        const withNote = render(
            <MatchEntryCard
                entry={makeEntry({
                    notes: "Cut inside on the right back all game.",
                    // `photo_url` is a BLANK STRING when absent, never null.
                    photo_url: "https://example.test/photo.jpg",
                })}
                onOpen={vi.fn()}
            />
        )

        expect(
            screen.getByText("Cut inside on the right back all game.")
        ).toBeTruthy()
        expect(withNote.container.querySelector("img")).toBeTruthy()
    })
})
