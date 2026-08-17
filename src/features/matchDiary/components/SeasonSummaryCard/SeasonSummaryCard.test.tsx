// @vitest-environment jsdom

/**
 * The summary card and its sparkline.
 *
 * Two things are pinned, and both are promises the card makes rather than
 * details of how it looks:
 *
 *   1. THE SPARSE CASE. Almost every player who sees this in month one has
 *      three matches, not a season. A card that only reads correctly when full
 *      is a card that reads as broken to everybody new, and that is not
 *      something a screenshot of the layout would catch.
 *   2. THE GAPS. An unrated match breaks the line. Interpolating across it
 *      would draw a rating the player never gave — the one number on this card
 *      that is purely their own opinion.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { MatchSummary } from "../../types"
import FormTrend from "../FormTrend/FormTrend"
import SeasonSummaryCard from "./SeasonSummaryCard"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

afterEach(cleanup)

const summary = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
    total_matches: 23,
    wins: 14,
    draws: 4,
    losses: 5,
    minutes_total: 1870,
    average_rating: 3.8,
    form: [],
    stats: [],
    ...overrides,
})

const goals = (total: number) => ({
    stat_field_id: "s1",
    name: "Goals",
    short_label: "G",
    unit: "",
    value_type: "integer" as const,
    total,
    entries_count: 12,
    zero_count: 2,
})

// ── Headline ──────────────────────────────────────────────────

describe("the headline", () => {
    it("leads with matches, then the catalog's leading stat, then minutes", () => {
        render(<SeasonSummaryCard summary={summary({ stats: [goals(14)] })} />)

        const headline = screen.getByText(/matches/).textContent ?? ""

        expect(headline).toContain("23")
        expect(headline).toContain("14 goals")
        // Grouped without toLocaleString, which would differ between the server
        // pass and the browser and desync hydration on the profile.
        expect(headline).toContain("1,870 minutes")
    })

    it("orders stats by the catalog, not by which total is biggest", () => {
        // The trap this guards: a striker's biggest football number is "40
        // shots", and headlining that over "14 goals" would be arithmetically
        // right and completely wrong. Catalog order is a human saying which
        // stats matter, and the API sends the rows in it — so the two that
        // lead are the first two, and the largest total is left out.
        render(
            <SeasonSummaryCard
                summary={summary({
                    stats: [
                        goals(14),
                        { ...goals(6), stat_field_id: "s2", name: "Assists" },
                        { ...goals(40), stat_field_id: "s3", name: "Shots" },
                    ],
                })}
            />
        )

        const headline = screen.getByText(/matches/).textContent ?? ""

        expect(headline).toContain("14 goals")
        expect(headline).toContain("6 assists")
        expect(headline).not.toContain("40 shots")
    })

    it("puts real spaces between the figures, so the line can break", () => {
        // Not a formatting nicety: with the separator as a CSS ::before and no
        // whitespace in the markup, this line has no break opportunity and
        // overflows a 320px card.
        render(<SeasonSummaryCard summary={summary({ stats: [goals(14)] })} />)

        expect(screen.getByText(/matches/).textContent).toContain(
            "matches · 14 goals · 1,870 minutes"
        )
    })

    it("says 'goal', not 'goals', at a total of one", () => {
        render(<SeasonSummaryCard summary={summary({ stats: [goals(1)] })} />)

        expect(screen.getByText(/matches/).textContent).toContain("1 goal")
    })

    it("still has something to say with no stats logged at all", () => {
        render(<SeasonSummaryCard summary={summary()} />)

        const headline = screen.getByText(/matches/).textContent ?? ""
        expect(headline).toContain("23")
        expect(headline).toContain("1,870 minutes")
    })
})

// ── The sparse case ───────────────────────────────────────────

describe("three matches logged", () => {
    const sparse = summary({
        total_matches: 3,
        wins: 2,
        draws: 0,
        losses: 1,
        minutes_total: 210,
        form: [],
        stats: [goals(1)],
    })

    it("reads correctly and draws only the bands it has", () => {
        const { container } = render(<SeasonSummaryCard summary={sparse} />)

        expect(screen.getByText(/matches/).textContent).toContain("3")

        // Two bands, not three with an invisible zero-width draw.
        expect(container.querySelectorAll("[data-tone]").length / 2).toBe(2)
        expect(screen.getByLabelText(/2 won, 0 drawn, 1 lost/)).toBeTruthy()
    })

    it("does not call one week a streak", () => {
        const { rerender } = render(
            <SeasonSummaryCard summary={sparse} streakWeeks={1} />
        )
        expect(screen.queryByText(/week/)).toBeNull()

        rerender(<SeasonSummaryCard summary={sparse} streakWeeks={2} />)
        expect(screen.getByText(/2 weeks running/)).toBeTruthy()
    })

    it("shows a fourth band for matches nobody kept score in", () => {
        // wins + draws + losses < total_matches: a friendly logged with no
        // result. Rescaling three numbers to 100% would misstate the season.
        render(
            <SeasonSummaryCard
                summary={summary({
                    total_matches: 10,
                    wins: 4,
                    draws: 1,
                    losses: 2,
                })}
            />
        )

        expect(
            screen.getByLabelText(/3 with no result recorded/)
        ).toBeTruthy()
    })
})

// ── FormTrend ─────────────────────────────────────────────────

describe("FormTrend", () => {
    it("stays hidden below three rated matches", () => {
        const { container } = render(<FormTrend ratings={[4, null, 3]} />)
        expect(container.innerHTML).toBe("")
    })

    it("breaks the line at a gap instead of drawing through it", () => {
        // Two runs of three: 4,3,5 — gap — 4,5,4. One polyline each, never one
        // continuous line across the missing match.
        const { container } = render(
            <FormTrend ratings={[4, 3, 5, null, 4, 5, 4]} />
        )

        expect(container.querySelectorAll("polyline").length).toBe(2)
        // A dot per rated match, and none for the gap.
        expect(container.querySelectorAll("circle").length).toBe(6)
    })

    it("still marks a rated match stranded between two gaps", () => {
        const { container } = render(
            <FormTrend ratings={[4, 3, 5, null, 4, null, 5]} />
        )

        // The lone 4 gets no line of its own but must not disappear.
        expect(container.querySelectorAll("polyline").length).toBe(1)
        expect(container.querySelectorAll("circle").length).toBe(5)
    })

    it("says the trend in words, because a sparkline says nothing to a reader", () => {
        render(<FormTrend ratings={[2, 2, 2, null, 5, 5, 5]} />)

        const label = screen.getByRole("img").getAttribute("aria-label") ?? ""

        expect(label).toContain("6 rated")
        expect(label).toContain("trending up")
        expect(label).toContain("1 not rated")
    })
})
