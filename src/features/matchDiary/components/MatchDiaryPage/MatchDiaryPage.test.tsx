// @vitest-environment jsdom

/**
 * MatchDiaryPage — the page's structure.
 *
 * Results are played matches and nothing else, fixtures live in Up next, and each
 * way into a fixture lands in the right place. The overlays are stubbed: each has
 * its own test file, and what matters here is what they are opened with.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { MatchEntry, UpcomingMatch } from "../../types"
import MatchDiaryPage from "./MatchDiaryPage"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
    useMyUserSports: () => ({ data: [] }),
}))

const sheetProps = vi.fn()

vi.mock("../MatchEntrySheet/MatchEntrySheet", () => ({
    default: (props: Record<string, unknown>) => {
        sheetProps(props)
        return <div data-testid="sheet" />
    },
}))

vi.mock("../MatchDetailModal/MatchDetailModal", () => ({
    default: ({ entry, onEdit }: { entry: MatchEntry; onEdit: () => void }) => (
        <div data-testid="detail">
            <span>Reading {entry.id}</span>
            <button type="button" onClick={onEdit}>
                Open edit
            </button>
        </div>
    ),
}))

const useMatches = vi.fn()
const upcoming = vi.fn()
const summary = vi.fn()

vi.mock("../../hooks/useMatchDiary", () => ({
    useMatches: (...args: unknown[]) => useMatches(...args),
    useUpcomingMatches: () => upcoming(),
    useMatchSummary: () => summary(),
}))

const entry = (id: string, overrides: Partial<MatchEntry> = {}): MatchEntry => ({
    id,
    sport: { id: "sport-1", name: "Football", icon_name: "", icon_url: "" },
    status: "played",
    date: "2026-08-15",
    kickoff_time: null,
    opponent_name: `Opponent ${id}`,
    match_type: "league",
    result: "win",
    minutes_played: 60,
    position: null,
    self_rating: null,
    notes: "",
    career_entry: null,
    photo_url: "",
    stats: [],
    created_at: "2026-08-15T10:00:00Z",
    updated_at: "2026-08-15T10:00:00Z",
    ...overrides,
})

const fixture = (
    id: string,
    overrides: Partial<UpcomingMatch> = {}
): UpcomingMatch => ({
    id,
    date: "2099-09-01",
    kickoff_time: null,
    opponent_name: `Fixture ${id}`,
    match_type: "league",
    sport: { id: "sport-1", name: "Football", icon_name: "", icon_url: "" },
    position: null,
    is_overdue: false,
    ...overrides,
})

const query = (results: MatchEntry[], overrides = {}) => ({
    data: { pages: [{ count: results.length, results }], pageParams: [0] },
    isLoading: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPlaceholderData: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
})

/** One scenario: what each list holds. */
const setup = ({
    played = [],
    scheduled = [],
    fixtures = [],
}: {
    played?: MatchEntry[]
    scheduled?: MatchEntry[]
    fixtures?: UpcomingMatch[]
}) => {
    useMatches.mockImplementation((filters: { status?: string }) =>
        query(filters.status === "scheduled" ? scheduled : played)
    )
    upcoming.mockReturnValue({ data: { count: fixtures.length, results: fixtures } })
}

beforeEach(() => {
    summary.mockReturnValue({ isPending: false, data: undefined })
})

afterEach(() => {
    cleanup()
    useMatches.mockReset()
    upcoming.mockReset()
    summary.mockReset()
    sheetProps.mockClear()
})

describe("results", () => {
    it("asks for played matches only, and offers no status segments", () => {
        setup({ played: [entry("a")] })

        render(<MatchDiaryPage />)

        expect(useMatches.mock.calls[0][0]).toMatchObject({ status: "played" })
        expect(screen.getByText("Opponent a")).toBeTruthy()

        expect(screen.queryByRole("radiogroup")).toBeNull()
        expect(screen.queryByRole("radio")).toBeNull()
        expect(screen.queryByText("Scheduled")).toBeNull()
    })

    it("does not list a fixture among the results", () => {
        const scheduled = entry("fixture-row", {
            status: "scheduled",
            result: "na",
            opponent_name: "Northgate United",
        })
        setup({
            played: [entry("a")],
            scheduled: [scheduled],
            fixtures: [fixture("fixture-row", { opponent_name: "Northgate United" })],
        })

        render(<MatchDiaryPage />)

        // Once, in Up next. Never again under Results.
        expect(screen.getAllByText("Northgate United")).toHaveLength(1)
        expect(screen.getByText("Opponent a")).toBeTruthy()
    })

    it("opens a card as a read, not as the edit form", () => {
        setup({ played: [entry("a")] })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByRole("button", { name: /Opponent a/ }))

        expect(screen.getByText("Reading a")).toBeTruthy()
        expect(screen.queryByTestId("sheet")).toBeNull()
    })

    it("keeps the detail mounted under the sheet", () => {
        setup({ played: [entry("a")] })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByRole("button", { name: /Opponent a/ }))
        fireEvent.click(screen.getByRole("button", { name: "Open edit" }))

        expect(screen.getByTestId("sheet")).toBeTruthy()
        expect(screen.getByTestId("detail")).toBeTruthy()
    })
})

describe("the states", () => {
    it("welcomes somebody with no matches, and offers no filters", () => {
        setup({})

        render(<MatchDiaryPage />)

        expect(screen.getByText("Your season, in one place")).toBeTruthy()
        expect(screen.queryByRole("combobox")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "Log your first match" }))
        expect(screen.getByTestId("sheet")).toBeTruthy()
    })

    it("offers a retry when the list fails", () => {
        const refetch = vi.fn()
        useMatches.mockImplementation(() =>
            query([], {
                data: undefined,
                isError: true,
                error: new Error("Nope"),
                refetch,
            })
        )
        upcoming.mockReturnValue({ data: { count: 0, results: [] } })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))

        expect(refetch).toHaveBeenCalled()
    })
})

describe("up next", () => {
    const five = ["1", "2", "3", "4", "5"].map((id) => fixture(id))

    it("shows three, then all of them behind 'Show all (N)'", () => {
        setup({ played: [entry("a")], fixtures: five })

        render(<MatchDiaryPage />)

        expect(screen.getByText("Fixture 3")).toBeTruthy()
        expect(screen.queryByText("Fixture 4")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "Show all (5)" }))

        expect(screen.getByText("Fixture 4")).toBeTruthy()
        expect(screen.getByText("Fixture 5")).toBeTruthy()
    })

    it("does not offer 'Show all' when they all fit", () => {
        setup({ fixtures: five.slice(0, 3) })

        render(<MatchDiaryPage />)

        expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull()
    })

    it("opens a fixture as a read when its full row is loaded, and Add result starts in Played mode", () => {
        const row = entry("1", { status: "scheduled", result: "na" })
        setup({ scheduled: [row], fixtures: [fixture("1")] })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByText("Fixture 1"))

        expect(screen.getByText("Reading 1")).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Open edit" }))

        expect(sheetProps).toHaveBeenLastCalledWith(
            expect.objectContaining({ entry: row, startPlayed: true })
        )
    })

    it("opens the sheet on the fixture itself when the full row is not loaded", () => {
        const light = fixture("1")
        setup({ fixtures: [light] })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByText("Fixture 1"))

        expect(sheetProps).toHaveBeenLastCalledWith(
            expect.objectContaining({ fixture: light })
        )
        expect(sheetProps.mock.lastCall?.[0].startPlayed).toBeFalsy()
    })
})

describe("overdue", () => {
    it("'Log result' opens the form already in Played mode", () => {
        const late = fixture("late", { is_overdue: true, date: "2020-05-09" })
        setup({ fixtures: [late] })

        render(<MatchDiaryPage />)
        fireEvent.click(screen.getByRole("button", { name: "Log result" }))

        expect(sheetProps).toHaveBeenLastCalledWith(
            expect.objectContaining({ fixture: late, startPlayed: true })
        )
    })
})

describe("the season overview", () => {
    const totals = {
        total_matches: 3,
        wins: 2,
        draws: 0,
        losses: 1,
        minutes_total: 0,
        average_rating: null,
        form: [],
        stats: [
            {
                stat_field_id: "s1",
                name: "Goals",
                short_label: "G",
                unit: "",
                value_type: "integer" as const,
                total: 4,
                entries_count: 3,
                zero_count: 0,
            },
        ],
    }

    it("is compact on a phone, with the stat grid behind a toggle", () => {
        setup({ played: [entry("a")] })
        summary.mockReturnValue({ isPending: false, data: totals })

        render(<MatchDiaryPage />)

        expect(screen.getByRole("button", { name: "See all stats" })).toBeTruthy()
        expect(screen.queryByText("Goals")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "See all stats" }))

        expect(screen.getByText("Goals")).toBeTruthy()
    })

    it("stays out of the way when there are no matches to total", () => {
        setup({})
        summary.mockReturnValue({
            isPending: false,
            data: { ...totals, total_matches: 0, stats: [] },
        })

        render(<MatchDiaryPage />)

        expect(screen.queryByRole("button", { name: "See all stats" })).toBeNull()
    })
})
