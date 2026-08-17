// @vitest-environment jsdom

/**
 * MatchDiarySection — who sees what.
 *
 * These are the tests worth having on this component, because every failure
 * mode here is silent. A bug that renders one match to a visitor does not
 * throw, does not fail a typecheck, and looks completely fine to whoever is
 * signed in while they build it — the person it is wrong for is somebody else.
 *
 * Pinned here:
 *   1. Showcase off (a 404) renders NOTHING. Not a heading, not an empty card.
 *      The backend answers 404 uniformly so that "showcase off" cannot be told
 *      apart from "no such player"; a client that rendered a distinct empty
 *      state would hand that distinction straight back.
 *   2. A visitor gets the totals and never an entry, an opponent, or the form
 *      chart of individual self-ratings.
 *   3. The logged-out profile fires nothing at all — that endpoint is
 *      authenticated, and the CV is the surface that faces the public web.
 *   4. The owner gets the diary: card, fixture, recent matches, both ways in.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type {
    MatchEntry,
    PlayerMatchSummary,
    UpcomingMatch,
} from "../../types"
import MatchDiarySection from "./MatchDiarySection"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
    }: {
        href: string
        children: React.ReactNode
    }) => <a href={href}>{children}</a>,
}))

// Mounting the sheet would drag in react-hook-form, the sports catalog and the
// stat catalog for a component that never opens it in these tests.
vi.mock("../MatchEntrySheet/MatchEntrySheet", () => ({ default: () => null }))

vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({ toMatchDiary: () => "/matches" }),
}))

const publicProfile = vi.fn(() => null as unknown)

vi.mock("@/features/profile/context/PublicProfileContext", () => ({
    usePublicProfile: () => publicProfile(),
}))

const authState = {
    user: { id: "user-1", role: "player" },
    actorType: "user",
}

vi.mock("@/store/auth.store", () => ({
    useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}))

const playerSummary = vi.fn()
const upcoming = vi.fn()
const matches = vi.fn()

vi.mock("../../hooks/useMatchDiary", () => ({
    usePlayerMatchSummary: (...args: unknown[]) => playerSummary(...args),
    useUpcomingMatches: (...args: unknown[]) => upcoming(...args),
    useMatches: (...args: unknown[]) => matches(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────

const SUMMARY: PlayerMatchSummary = {
    username: "riya",
    total_matches: 12,
    wins: 7,
    draws: 2,
    losses: 3,
    minutes_total: 1870,
    average_rating: 3.8,
    form: [4, 3, null, 5, 4, 3, 4, null, 5, 4],
    stats: [
        {
            stat_field_id: "s1",
            name: "Goals",
            short_label: "G",
            unit: "",
            value_type: "integer",
            total: 14,
            entries_count: 9,
            zero_count: 3,
        },
    ],
    current_streak_weeks: 4,
    longest_streak_weeks: 6,
    is_owner: false,
}

const ENTRY: MatchEntry = {
    id: "m1",
    sport: { id: "sp1", name: "Football", icon_name: "", icon_url: "" },
    status: "played",
    date: "2026-08-09",
    kickoff_time: null,
    opponent_name: "Riverside FC",
    match_type: "league",
    result: "win",
    minutes_played: 90,
    position: null,
    self_rating: 4,
    notes: "Best game of the season",
    career_entry: null,
    photo_url: "",
    stats: [],
    created_at: "2026-08-09T18:00:00Z",
    updated_at: "2026-08-09T18:00:00Z",
}

const FIXTURE: UpcomingMatch = {
    id: "m2",
    date: "2099-09-01",
    kickoff_time: "15:00:00",
    opponent_name: "Northgate United",
    match_type: "league",
    sport: { id: "sp1", name: "Football", icon_name: "", icon_url: "" },
    position: null,
    is_overdue: false,
}

/** Wires the three hooks for one scenario. */
const setup = (options: {
    summary?: PlayerMatchSummary | null
    pending?: boolean
    entries?: MatchEntry[]
    fixtures?: UpcomingMatch[]
}) => {
    playerSummary.mockReturnValue({
        data: options.summary ?? undefined,
        isPending: options.pending ?? false,
    })
    upcoming.mockReturnValue({
        data: { count: options.fixtures?.length ?? 0, results: options.fixtures ?? [] },
        isPending: false,
    })
    matches.mockReturnValue({
        data: {
            pages: [
                {
                    count: options.entries?.length ?? 0,
                    limit: 20,
                    offset: 0,
                    results: options.entries ?? [],
                },
            ],
            pageParams: [0],
        },
    })
}

afterEach(() => {
    cleanup()
    publicProfile.mockReturnValue(null)
    authState.user = { id: "user-1", role: "player" }
    authState.actorType = "user"
    playerSummary.mockReset()
    upcoming.mockReset()
    matches.mockReset()
})

// ── Visitor ───────────────────────────────────────────────────

describe("a visitor", () => {
    it("sees nothing at all when the showcase is off", () => {
        // A 404 lands as "settled, no data" — see retryMatchDiaryQuery.
        setup({ summary: null })

        const { container } = render(
            <MatchDiarySection username="riya" isOwn={false} />
        )

        expect(container.innerHTML).toBe("")
    })

    it("sees nothing while the request is still in flight", () => {
        // Never a heading that might vanish a moment later.
        setup({ summary: null, pending: true })

        const { container } = render(
            <MatchDiarySection username="riya" isOwn={false} />
        )

        expect(container.innerHTML).toBe("")
    })

    it("sees the totals when the showcase is on", () => {
        setup({ summary: SUMMARY })

        render(<MatchDiarySection username="riya" isOwn={false} />)

        expect(screen.getByText("Match diary")).toBeTruthy()
        expect(screen.getByText(/12/)).toBeTruthy()
        // The streak is what a visiting coach reads this for.
        expect(screen.getByText(/4 weeks running/)).toBeTruthy()
    })

    it("never sees an entry, and never sees the form chart", () => {
        // The hooks are disabled for a visitor, but pretend they returned
        // anyway: the render must not depend on that for its privacy.
        setup({ summary: SUMMARY, entries: [ENTRY], fixtures: [FIXTURE] })

        render(<MatchDiarySection username="riya" isOwn={false} />)

        expect(screen.queryByText(/Riverside FC/)).toBeNull()
        expect(screen.queryByText(/Northgate United/)).toBeNull()
        expect(screen.queryByText(/Best game of the season/)).toBeNull()
        // `form` is ten individual self-ratings, not an aggregate.
        expect(screen.queryByText("Form")).toBeNull()
        // And no way into the owner's own diary.
        expect(screen.queryByText(/View all matches/)).toBeNull()
        expect(screen.queryByText(/Log a match/)).toBeNull()
    })

    it("sees nothing on the logged-out profile, whatever the cache holds", () => {
        publicProfile.mockReturnValue({ displayName: "Riya" })
        setup({ summary: SUMMARY })

        const { container } = render(
            <MatchDiarySection username="riya" isOwn={false} />
        )

        expect(container.innerHTML).toBe("")
    })
})

// ── Owner ─────────────────────────────────────────────────────

describe("the owner", () => {
    it("gets the card, the next fixture, their recent matches and both ways in", () => {
        setup({ summary: SUMMARY, entries: [ENTRY], fixtures: [FIXTURE] })

        render(<MatchDiarySection username="riya" isOwn />)

        expect(screen.getByText(/4 weeks running/)).toBeTruthy()
        expect(screen.getByText("Up next")).toBeTruthy()
        expect(screen.getByText(/Northgate United/)).toBeTruthy()
        expect(screen.getByText("Riverside FC")).toBeTruthy()
        expect(screen.getByText("Form")).toBeTruthy()
        expect(screen.getByText(/View all matches/)).toBeTruthy()
        expect(screen.getByText(/Log a match/)).toBeTruthy()
    })

    it("gets a one-line invitation, not an empty card, with nothing logged", () => {
        setup({ summary: { ...SUMMARY, total_matches: 0, stats: [], form: [] } })

        render(<MatchDiarySection username="riya" isOwn />)

        expect(screen.getByText(/build a season record/i)).toBeTruthy()
        // No heading, no card, no "View all" pointing at an empty diary.
        expect(screen.queryByText("Match diary")).toBeNull()
        expect(screen.queryByText(/View all matches/)).toBeNull()
    })

    it("keeps the section when the only thing logged is a fixture", () => {
        setup({
            summary: { ...SUMMARY, total_matches: 0, stats: [], form: [] },
            fixtures: [FIXTURE],
        })

        render(<MatchDiarySection username="riya" isOwn />)

        expect(screen.getByText("Up next")).toBeTruthy()
        expect(screen.queryByText(/build a season record/i)).toBeNull()
    })

    it("is read-only while acting as an organization", () => {
        // The endpoints refuse an org actor, so the profile must not offer the
        // controls that would call them.
        authState.actorType = "organization"
        setup({ summary: SUMMARY, entries: [ENTRY] })

        render(<MatchDiarySection username="riya" isOwn />)

        expect(screen.getByText("Match diary")).toBeTruthy()
        expect(screen.queryByText(/Log a match/)).toBeNull()
        expect(screen.queryByText("Riverside FC")).toBeNull()
    })

    it("renders nothing for a coach — they have no diary", () => {
        authState.user = { id: "user-1", role: "coach" }
        // The endpoint 404s on the role check.
        setup({ summary: null })

        const { container } = render(
            <MatchDiarySection username="riya" isOwn />
        )

        expect(container.innerHTML).toBe("")
    })
})
