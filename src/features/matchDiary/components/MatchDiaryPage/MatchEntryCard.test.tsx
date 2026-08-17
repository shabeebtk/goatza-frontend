// @vitest-environment jsdom

/**
 * MatchEntryCard — what the card shows, and what it refuses to show.
 *
 * The card exists because the row it replaced threw data away, so most of what
 * is worth pinning here is the OTHER failure: a card that invents something.
 * An absent stat rendered as "0", a chip on a match with no result, an empty
 * note strip, five hollow stars on an unrated match — each of those is a number
 * or a claim the player never entered, and each is cheap to reintroduce.
 *
 * Layout is not tested. jsdom has no layout, so an assertion about a truncated
 * label or a tile row filling its width would only be testing the class name.
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
    match_type: "school_college",
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

describe("what the card renders", () => {
    it("shows a tile per logged stat, plus minutes — and nothing for the rest", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({
                    stats: [stat("Goals", 2), stat("Assists", 1)],
                })}
                onOpen={vi.fn()}
            />
        )

        expect(screen.getByText("Goals")).toBeTruthy()
        expect(screen.getByText("Assists")).toBeTruthy()
        expect(screen.getByText("Played")).toBeTruthy()

        // A stat the player did not log is ABSENT, not zero — the season
        // summary counts "logged as 0" and "never logged" differently.
        expect(screen.queryByText("Shots on target")).toBeNull()
        expect(screen.queryByText("0")).toBeNull()
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

        expect(container.textContent).toContain("2Goals")
        expect(container.textContent).not.toContain("2.00")
        expect(container.textContent).toContain("10.5km")
    })

    it("caps at four stats, primaries first, and counts the rest into +N", () => {
        const stats = [
            ...Array.from({ length: 10 }, (_, index) =>
                stat(`Filler ${index}`, index + 1)
            ),
            stat("Goals", 3, { is_primary: true }),
            stat("Assists", 2, { is_primary: true }),
        ]

        render(<MatchEntryCard entry={makeEntry({ stats })} onOpen={vi.fn()} />)

        // Primaries win a slot however far down the API returned them.
        expect(screen.getByText("Goals")).toBeTruthy()
        expect(screen.getByText("Assists")).toBeTruthy()
        // Then the API's own order fills what is left — two of it, not ten.
        expect(screen.getByText("Filler 0")).toBeTruthy()
        expect(screen.getByText("Filler 1")).toBeTruthy()
        expect(screen.queryByText("Filler 2")).toBeNull()

        expect(screen.getByText("+8")).toBeTruthy()
    })

    it("puts the whole match in one sentence for a screen reader", () => {
        const onOpen = vi.fn()
        const entry = makeEntry()

        render(<MatchEntryCard entry={entry} onOpen={onOpen} />)

        expect(
            screen.getByText("Won — Kannur FC, 15 August 2026")
        ).toBeTruthy()
        expect(
            screen.getByLabelText("Your rating: 4 out of 5")
        ).toBeTruthy()

        fireEvent.click(screen.getByRole("button"))
        expect(onOpen).toHaveBeenCalledWith(entry)
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
    it("gives an `na` match no result chip at all", () => {
        render(
            <MatchEntryCard
                entry={makeEntry({ result: "na" })}
                onOpen={vi.fn()}
            />
        )

        // "Not applicable" is a database value. A friendly nobody kept score
        // in has no result, and the right rendering of that is no chip.
        expect(screen.queryByText(/not applicable/i)).toBeNull()
        expect(screen.queryByText("Won")).toBeNull()
        expect(screen.queryByText("Lost")).toBeNull()
        expect(screen.queryByText("Drawn")).toBeNull()
        expect(screen.getByText(/^Logged — Kannur FC/)).toBeTruthy()
    })

    it("renders no empty sections for a match with nothing but an opponent", () => {
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
        expect(screen.queryByText("Played")).toBeNull()
        expect(screen.queryByLabelText(/Your rating/)).toBeNull()
        // No hollow stars stood in for the rating that is not there.
        expect(container.querySelector('[data-icon="mdi:star-outline"]')).toBeNull()
    })

    it("renders a scheduled fixture with no tiles and no result", () => {
        const { container } = render(
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
        expect(screen.queryByText("Played")).toBeNull()
        expect(screen.queryByText("Won")).toBeNull()
        expect(container.querySelector('[data-icon="mdi:star"]')).toBeNull()
    })

    it("shows the note strip only when there is a note or a photo", () => {
        const { container, unmount } = render(
            <MatchEntryCard
                entry={makeEntry({ notes: "   " })}
                onOpen={vi.fn()}
            />
        )

        // Whitespace is not a note, and there is no photo either — so the
        // strip and its divider are absent rather than empty.
        expect(container.querySelector("img")).toBeNull()
        expect(container.textContent).not.toContain("Cut inside")

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
