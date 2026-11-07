// @vitest-environment jsdom

/**
 * MatchEntrySheet — the two flows the whole feature exists for.
 *
 * These are interaction tests rather than render tests, because the claim
 * being made about this screen is about INTERACTIONS: "thirty seconds from tap
 * to saved" is really "the fast path is a handful of taps and the body that
 * comes out of them is right". A test can hold the first half of that honestly;
 * the second half needs a phone.
 *
 * So what is pinned here is:
 *   1. The fast path — result, opponent, two stats — is six taps and produces
 *      the payload it should, with the stats nobody filled in absent rather
 *      than sent as zeros.
 *   2. Promoting a fixture is ONE PATCH carrying the status and the result
 *      together, and it PATCHes the fixture's own id rather than creating a
 *      second row.
 *
 * The data layer is mocked. Every hook here is already tested where it lives,
 * and a real QueryClient would only add ways for this to fail for reasons that
 * have nothing to do with the flow.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { MatchEntry, MatchStatField, UpcomingMatch } from "../../types"
import MatchEntrySheet from "./MatchEntrySheet"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

// The sheet does not navigate, but its ui/Select fields call useBackToClose,
// which reaches for the app router as soon as they render.
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

const showToast = vi.fn()

vi.mock("@/shared/components/ui/Toast/Toast", () => ({
    useToast: () => ({ show: showToast }),
}))

const createMutate = vi.fn().mockResolvedValue({})
const updateMutate = vi.fn().mockResolvedValue({})

const STAT_FIELDS: MatchStatField[] = [
    {
        id: "stat-goals",
        name: "Goals",
        short_label: "G",
        unit: "",
        value_type: "integer",
        is_primary: true,
        order: 1,
        position_ids: [],
    },
    {
        id: "stat-assists",
        name: "Assists",
        short_label: "A",
        unit: "",
        value_type: "integer",
        is_primary: true,
        order: 2,
        position_ids: [],
    },
    {
        id: "stat-shots",
        name: "Shots on target",
        short_label: "SOT",
        unit: "",
        value_type: "integer",
        is_primary: true,
        order: 3,
        position_ids: [],
    },
    {
        id: "stat-distance",
        name: "Distance covered",
        short_label: "DIST",
        unit: "km",
        value_type: "decimal",
        is_primary: false,
        order: 4,
        position_ids: [],
    },
]

// Reassigned by the test that needs the catalogs still on their way.
let sportsLoading = false

vi.mock("../../hooks/useMatchDiary", () => ({
    matchDiaryKeys: { lists: () => ["matchDiary", "list"] },
    useMatchStatFields: () => ({
        data: { count: STAT_FIELDS.length, results: STAT_FIELDS },
        isLoading: false,
        isError: false,
    }),
    useCreateMatch: () => ({ mutateAsync: createMutate, isPending: false }),
    useUpdateMatch: () => ({ mutateAsync: updateMutate, isPending: false }),
}))

vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
    // One sport, which is most players — so the sport field is not rendered at
    // all and does not appear in the tap count below.
    useSportsList: () => ({
        data: [
            {
                id: "sport-1",
                name: "Football",
                icon_name: "",
                icon_url: "",
                positions: [{ id: "pos-st", name: "Striker" }],
                attributes: [],
            },
        ],
        isLoading: sportsLoading,
    }),
    useMyUserSports: () => ({
        data: [
            {
                id: "us-1",
                sport: {
                    id: "sport-1",
                    name: "Football",
                    icon_name: "",
                    icon_url: "",
                },
                is_primary: true,
                experience_level: "amateur",
                positions: [{ position: "Striker", is_primary: true }],
                attributes: [],
            },
        ],
        isLoading: false,
    }),
}))

vi.mock("@/features/career/hooks/useCareerQueries", () => ({
    useUserCareer: () => ({ data: undefined }),
}))

const uploadPhoto = vi.fn()

vi.mock("../../services/matchPhoto.service", () => ({
    validateMatchPhoto: () => null,
    uploadMatchPhoto: (...args: unknown[]) => uploadPhoto(...args),
}))

vi.mock("@/store/auth.store", () => ({
    useAuthStore: (selector: (s: unknown) => unknown) =>
        selector({ user: { id: "user-1" } }),
}))

// A cold cache: no previous opponents, no recent match type. The pessimistic
// case for the fast path, and the one a brand new player actually sees.
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ getQueriesData: () => [] }),
}))

afterEach(async () => {
    cleanup()
    // jsdom keeps one history for the whole file. Let a pop still in flight land,
    // then wipe the entry we are left on so the next test starts at depth 0.
    await new Promise((resolve) => setTimeout(resolve, 20))
    window.history.replaceState(null, "")
    createMutate.mockClear()
    updateMutate.mockClear()
    showToast.mockClear()
    sportsLoading = false
})

/** Taps the + beside a named stat, `times` times. */
const bumpStat = (name: string, times: number) => {
    const plus = screen.getByLabelText(`One more ${name}`)
    for (let i = 0; i < times; i += 1) fireEvent.click(plus)
}

/**
 * A stat's own input. Matched on the START of the label because the label is
 * the name followed by the short code ("GoalsG"), and a loose match would also
 * catch the two stepper buttons, whose aria-labels name the stat too.
 */
const statInput = (name: string) =>
    screen.getByLabelText(new RegExp(`^${name}`)) as HTMLInputElement

describe("logging a played match", () => {
    it("is six taps from open to saved, and sends only what was filled in", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)

        // The date is already today and the sport is already their only sport,
        // so neither costs a tap.
        fireEvent.click(screen.getByRole("radio", { name: "Won" }))          // 1

        fireEvent.change(screen.getByLabelText(/^Opponent/), {
            target: { value: "Riverside FC" },
        })

        bumpStat("Goals", 2)                                                  // 2, 3
        bumpStat("Assists", 1)                                                // 4

        fireEvent.click(screen.getByRole("button", { name: "Log match" }))    // 5

        await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1))

        const payload = createMutate.mock.calls[0][0]

        expect(payload).toMatchObject({
            sport: "sport-1",
            status: "played",
            result: "win",
            opponent_name: "Riverside FC",
            // Defaulted from the player's primary position, untouched.
            position: "pos-st",
        })

        // Only what was actually entered. Shots on target was on screen and
        // left blank, and a blank is NOT a zero — the summary counts the two
        // differently and a fabricated 0 would show up as a stat they logged.
        expect(payload.stats).toEqual([
            { stat_field_id: "stat-goals", value: 2 },
            { stat_field_id: "stat-assists", value: 1 },
        ])

        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(showToast).toHaveBeenCalledWith({
            title: "Match logged",
            variant: "success",
        })
    })

    it("keeps everything the player typed when the server refuses it", async () => {
        createMutate.mockRejectedValueOnce(new Error("Nope"))
        const onClose = vi.fn()

        render(<MatchEntrySheet onClose={onClose} />)

        fireEvent.change(screen.getByLabelText(/^Opponent/), {
            target: { value: "Riverside FC" },
        })
        bumpStat("Goals", 3)
        fireEvent.click(screen.getByRole("button", { name: "Log match" }))

        await vi.waitFor(() => expect(createMutate).toHaveBeenCalled())

        // The sheet stays open, and it still holds the match.
        expect(onClose).not.toHaveBeenCalled()
        expect(
            (screen.getByLabelText(/^Opponent/) as HTMLInputElement).value
        ).toBe("Riverside FC")
        expect(statInput("Goals").value).toBe("3")

        // ...and the form is usable again rather than left mid-submit.
        expect(statInput("Goals").disabled).toBe(false)
    })

    it("refuses a match dated in the future rather than sending it", async () => {
        render(<MatchEntrySheet onClose={vi.fn()} />)

        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2099-01-01" },
        })
        fireEvent.click(screen.getByRole("button", { name: "Log match" }))

        await vi.waitFor(() =>
            expect(screen.getByRole("alert").textContent).toMatch(
                /switch to Upcoming/i
            )
        )
        expect(createMutate).not.toHaveBeenCalled()
        // A rejected submit must leave the form editable — see `onInvalid`.
        expect(statInput("Goals").disabled).toBe(false)
    })
})

describe("saying what happened", () => {
    it("says a fixture was added", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)

        fireEvent.click(screen.getByRole("radio", { name: "Upcoming" }))
        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2099-01-01" },
        })
        fireEvent.click(screen.getByRole("button", { name: "Add fixture" }))

        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(showToast).toHaveBeenCalledWith({
            title: "Fixture added",
            variant: "success",
        })
    })
})

describe("closing", () => {
    const dirty = () =>
        fireEvent.change(screen.getByLabelText(/^Opponent/), {
            target: { value: "Riverside FC" },
        })

    it("closes on one back press when nothing has changed", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)

        act(() => window.history.back())

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        expect(screen.queryByRole("alertdialog")).toBeNull()
    })

    it("asks first on a back press when the form is dirty, and keeps the form", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)
        dirty()

        act(() => window.history.back())

        const confirm = await screen.findByRole("alertdialog")
        expect(confirm.textContent).toContain("Discard this match?")
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))

        await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(onClose).not.toHaveBeenCalled()
        expect(
            (screen.getByLabelText(/^Opponent/) as HTMLInputElement).value
        ).toBe("Riverside FC")
    })

    it("closes the form when Discard is the answer", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)
        dirty()

        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        fireEvent.click(await screen.findByRole("button", { name: "Discard" }))

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("lets one back press close the confirm and leaves the sheet", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)
        dirty()

        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        await screen.findByRole("alertdialog")

        act(() => window.history.back())

        await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("lets Esc close the confirm only", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)
        dirty()

        fireEvent.click(screen.getByRole("button", { name: "Close" }))
        await screen.findByRole("alertdialog")

        fireEvent.keyDown(document, { key: "Escape" })

        await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("has a way out while the catalogs are still loading", async () => {
        sportsLoading = true
        const onClose = vi.fn()
        render(<MatchEntrySheet onClose={onClose} />)

        expect(screen.getByRole("dialog", { name: "Log a match" })).toBeTruthy()

        fireEvent.keyDown(window, { key: "Escape" })

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })
})

describe("the form", () => {
    it("keeps the file input mounted, so one tap on 'Add a photo' opens the picker", () => {
        const click = vi
            .spyOn(HTMLInputElement.prototype, "click")
            .mockImplementation(() => {})

        render(<MatchEntrySheet onClose={vi.fn()} />)

        fireEvent.click(screen.getByRole("button", { name: "Add a photo" }))

        expect(click).toHaveBeenCalledTimes(1)
        click.mockRestore()
    })

    it("caps the date at today in Played mode, and not for a fixture", () => {
        render(<MatchEntrySheet onClose={vi.fn()} />)
        const date = screen.getByLabelText("Date") as HTMLInputElement

        expect(date.max).toBeTruthy()

        fireEvent.click(screen.getByRole("radio", { name: "Upcoming" }))

        expect(date.max).toBe("")
    })

    it("stays 'Log a match' when a new entry flips to Upcoming", () => {
        render(<MatchEntrySheet onClose={vi.fn()} />)

        fireEvent.click(screen.getByRole("radio", { name: "Upcoming" }))

        expect(screen.getByRole("dialog", { name: "Log a match" })).toBeTruthy()
    })
})

describe("the photo's status", () => {
    URL.createObjectURL = vi.fn(() => "blob:photo")
    URL.revokeObjectURL = vi.fn()

    const liveRegion = () =>
        screen
            .getByRole("dialog")
            .querySelector('[aria-live="polite"]') as HTMLElement

    const pickPhoto = () => {
        const click = vi
            .spyOn(HTMLInputElement.prototype, "click")
            .mockImplementation(() => {})
        fireEvent.click(screen.getByRole("button", { name: "Add a photo" }))
        click.mockRestore()

        fireEvent.change(screen.getByLabelText("Choose a photo"), {
            target: {
                files: [new File(["x"], "match.jpg", { type: "image/jpeg" })],
            },
        })
    }

    it("reads out 'Uploading…', from a region that was already there and empty", async () => {
        let finish: (photo: object) => void = () => {}
        uploadPhoto.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve
            })
        )

        render(<MatchEntrySheet onClose={vi.fn()} />)

        // A live region that arrives holding its text announces nothing.
        const region = liveRegion()
        expect(region.textContent).toBe("")

        pickPhoto()

        expect(liveRegion()).toBe(region)
        expect(region.textContent).toBe("Uploading…")

        act(() =>
            finish({
                photo_url: "https://example.test/photo.jpg",
                photo_public_id: "photo",
            })
        )

        await vi.waitFor(() => expect(region.textContent).toBe("Ready"))
    })

    it("says when the photo did not upload", async () => {
        uploadPhoto.mockRejectedValueOnce(new Error("Nope"))

        render(<MatchEntrySheet onClose={vi.fn()} />)
        pickPhoto()

        await vi.waitFor(() =>
            expect(liveRegion().textContent).toBe("Didn't upload")
        )
    })

    it("says nothing about a photo the match already had", () => {
        const entry: MatchEntry = {
            id: "match-7",
            sport: { id: "sport-1", name: "Football", icon_name: "", icon_url: "" },
            status: "played",
            date: "2020-05-09",
            kickoff_time: null,
            opponent_name: "Riverside FC",
            match_type: "league",
            result: "win",
            minutes_played: 90,
            position: null,
            self_rating: null,
            notes: "",
            career_entry: null,
            photo_url: "https://example.test/photo.jpg",
            stats: [],
            created_at: "2020-05-09T18:00:00Z",
            updated_at: "2020-05-09T18:00:00Z",
        }

        render(<MatchEntrySheet entry={entry} onClose={vi.fn()} />)

        expect(liveRegion().textContent).toBe("")
    })
})

describe("promoting a fixture", () => {
    const fixture: UpcomingMatch = {
        id: "match-42",
        // In the past: this is an OVERDUE fixture, which is the row the diary
        // exists to chase, and the one the "no fixtures in the past" rule must
        // not refuse to save.
        date: "2020-05-09",
        kickoff_time: "15:00:00",
        opponent_name: "Riverside FC",
        match_type: "league",
        sport: {
            id: "sport-1",
            name: "Football",
            icon_name: "",
            icon_url: "",
        },
        position: { id: "pos-st", name: "Striker" },
        is_overdue: true,
    }

    it("is one PATCH on the fixture's own id, carrying status and result together", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet fixture={fixture} onClose={onClose} />)

        // The fixture opens locked to Upcoming, with one obvious way forward.
        fireEvent.click(screen.getByRole("button", { name: /Log the result/i }))

        fireEvent.click(screen.getByRole("radio", { name: "Won" }))
        bumpStat("Goals", 1)

        fireEvent.click(screen.getByRole("button", { name: "Log result" }))

        await vi.waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1))
        expect(createMutate).not.toHaveBeenCalled()

        const { matchId, payload } = updateMutate.mock.calls[0][0]

        expect(matchId).toBe("match-42")
        expect(payload).toMatchObject({
            status: "played",
            result: "win",
            date: "2020-05-09",
            opponent_name: "Riverside FC",
            match_type: "league",
        })
        expect(payload.stats).toEqual([
            { stat_field_id: "stat-goals", value: 1 },
        ])

        // The sheet never loaded these — the "Up next" shape has no room for
        // them — so they must not be sent back as the blanks the form holds.
        expect(payload).not.toHaveProperty("notes")
        expect(payload).not.toHaveProperty("career_entry")
    })

    it("opens already in Played mode with startPlayed, with no extra tap", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />)

        expect(screen.queryByRole("button", { name: /Log the result/i })).toBeNull()
        expect(
            (screen.getByLabelText("Date") as HTMLInputElement).value
        ).toBe("2020-05-09")
        expect(
            (screen.getByLabelText(/^Opponent/) as HTMLInputElement).value
        ).toBe("Riverside FC")

        fireEvent.click(screen.getByRole("radio", { name: "Won" }))
        fireEvent.click(screen.getByRole("button", { name: "Log result" }))

        await vi.waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1))
        expect(updateMutate.mock.calls[0][0].payload).toMatchObject({
            status: "played",
            result: "win",
            match_type: "league",
        })

        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(showToast).toHaveBeenCalledWith({
            title: "Match logged",
            variant: "success",
        })
    })

    it("does not count startPlayed as an edit, so it closes without asking", async () => {
        const onClose = vi.fn()
        render(<MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />)

        fireEvent.click(screen.getByRole("button", { name: "Close" }))

        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        expect(screen.queryByRole("alertdialog")).toBeNull()
    })

    describe("after 'Not played yet'", () => {
        const undo = () =>
            fireEvent.click(screen.getByRole("button", { name: /Not played yet/ }))

        it("titles itself from the status it is on now", () => {
            render(
                <MatchEntrySheet fixture={fixture} startPlayed onClose={vi.fn()} />
            )
            expect(screen.getByRole("dialog", { name: "Log result" })).toBeTruthy()

            undo()
            expect(screen.getByRole("dialog", { name: "Edit fixture" })).toBeTruthy()
            expect(screen.getByRole("heading", { name: "Edit fixture" })).toBeTruthy()

            fireEvent.click(screen.getByRole("button", { name: /Log the result/i }))
            expect(screen.getByRole("dialog", { name: "Log result" })).toBeTruthy()
        })

        it("does not count the switch back as a change", async () => {
            const onClose = vi.fn()
            render(
                <MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />
            )

            undo()
            fireEvent.click(screen.getByRole("button", { name: "Close" }))

            await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
            expect(screen.queryByRole("alertdialog")).toBeNull()
        })

        it("does not ask on a back press either", async () => {
            const onClose = vi.fn()
            render(
                <MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />
            )

            undo()
            act(() => window.history.back())

            await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
            expect(screen.queryByRole("alertdialog")).toBeNull()
        })

        it("does not count what the switch cleared, either", async () => {
            const onClose = vi.fn()
            render(
                <MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />
            )

            fireEvent.click(screen.getByRole("radio", { name: "Won" }))
            bumpStat("Goals", 2)
            fireEvent.change(screen.getByLabelText(/^Minutes played/), {
                target: { value: "90" },
            })

            undo()
            fireEvent.click(screen.getByRole("button", { name: "Close" }))

            await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
            expect(screen.queryByRole("alertdialog")).toBeNull()
        })

        it("still asks when a real edit survives the switch back", async () => {
            const onClose = vi.fn()
            render(
                <MatchEntrySheet fixture={fixture} startPlayed onClose={onClose} />
            )

            fireEvent.change(screen.getByLabelText(/^Opponent/), {
                target: { value: "Northgate United" },
            })
            undo()
            fireEvent.click(screen.getByRole("button", { name: "Close" }))

            expect(await screen.findByRole("alertdialog")).toBeTruthy()
            expect(onClose).not.toHaveBeenCalled()
        })
    })
})
