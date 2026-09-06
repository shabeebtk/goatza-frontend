// @vitest-environment jsdom

/**
 * RecruitmentDetail — the three states, and the rules that keep them apart.
 *
 * Every failure mode here is silent. A viewer shown the manage bar, an
 * organiser shown "Apply now", or a closed trial still taking applications all
 * render perfectly and typecheck fine — the person they are wrong for is
 * somebody else.
 *
 * Pinned here:
 *   1. State selection: viewer / applied / organiser, from the data the page
 *      already has, plus the organiser's read-only player preview.
 *   2. The closed and capacity-full treatments, which are the difference
 *      between a dead button and a lie.
 *   3. Owner-only numbers never reaching a viewer.
 *   4. The mockup's no-break rules that live in THIS component (the media ones
 *      are pinned in RecruitmentHeroCarousel's own tests).
 *
 * The layout itself is not tested: it is CSS, and a screenshot is the only
 * thing that would catch a regression there.
 *
 * Why getAllBy nearly everywhere: the desktop state card and the mobile sticky
 * bar are BOTH in the DOM — CSS media queries pick one, and jsdom applies no
 * media queries. So an action that exists once on screen exists twice here.
 * That is the component working: asserting "at least one" is the honest
 * question, and a state that vanished would still fail.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import RecruitmentDetail from "./RecruitmentDetail"
import type { RecruitmentDetail as TRecruitmentDetail } from "../../services/recruitments.api"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}))

vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({ toProfile: (u: string) => `/org/${u}` }),
}))

// Heavy children that never open in these tests. Mounting them would drag in
// react-hook-form, the media pipeline and the share/report stacks.
vi.mock("../ApplyRecruitmentModal/ApplyRecruitmentModal", () => ({ default: () => null }))
vi.mock("../StatusChangeMenu/StatusChangeMenu", () => ({ default: () => null }))
vi.mock("@/features/moderation/components/ReportSheet/ReportSheet", () => ({ default: () => null }))
vi.mock("@/features/messages/components/ShareSheet/ShareSheet", () => ({ default: () => null }))
vi.mock("../RecruitmentSharePreview/RecruitmentSharePreview", () => ({ default: () => null }))
vi.mock("./ApplicationSheet", () => ({ default: () => null }))
// Its own query; the organiser tests assert the section's presence, not its rows.
vi.mock("./LatestApplicants", () => ({
    default: ({ total }: { total: number }) => <div data-testid="latest-applicants">{total}</div>,
}))

vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({
    default: ({ initials }: { initials?: string }) => <span>{initials}</span>,
}))

const detailQuery = vi.fn()
const toggleSave = vi.fn()

vi.mock("../../hooks/useRecruitments", () => ({
    useRecruitmentDetail: () => detailQuery(),
    useToggleSaveRecruitment: () => ({ mutate: toggleSave }),
    useWithdrawApplication: () => ({ mutate: vi.fn(), isPending: false }),
}))

/**
 * jsdom ships no matchMedia. Without a stub the component stays on its
 * mobile arrangement, which is what most tests below want; `asDesktop()`
 * installs one so the wide layout can be exercised too.
 */
function asDesktop() {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    })
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

// ── Fixtures ──────────────────────────────────────────────────

const FAR_FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 54).toISOString()
const PAST = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()

function makeRecruitment(
    overrides: Partial<TRecruitmentDetail> = {}
): TRecruitmentDetail {
    return {
        id: "rec-1",
        title: "Open Trials",
        short_description: "",
        description: "Trials based in Thalassery.",
        recruitment_type: "open_trial",
        visibility: "public",
        apply_method: "goatza",
        gender: "male",
        experience_level: "district",
        application_deadline: FAR_FUTURE,
        event_date: FAR_FUTURE,
        is_remote: false,
        is_paid: true,
        fee_amount: "50",
        fee_currency: "INR",
        payment_note: "",
        venue_name: "Thalassery Stadium",
        venue_link: "https://maps.example/thalassery",
        location_name: "",
        city: "Thalassery",
        country_code: "IN",
        latitude: null,
        longitude: null,
        external_apply_url: "",
        applications_count: 14,
        organization: {
            id: "org-1",
            username: "thalasseryfc",
            name: "Thalassery United FC",
            logo: "",
            is_verified: true,
            headline: "Passion. Pride.",
        },
        sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
        positions: [],
        media: [],
        questions: [],
        age_categories: [],
        benefits: [],
        requirements: [],
        eligibility_criteria: [],
        contacts: [],
        my_application: null,
        can_apply: true,
        is_accepting_applications: true,
        created_at: PAST,
        is_saved: false,
        ...overrides,
    } as TRecruitmentDetail
}

function renderDetail(
    recruitment: Partial<TRecruitmentDetail> = {},
    props: { isOrgView?: boolean } = {}
) {
    detailQuery.mockReturnValue({
        data: makeRecruitment(recruitment),
        isLoading: false,
        isError: false,
    })
    return render(<RecruitmentDetail recruitmentId="rec-1" {...props} />)
}

/** The apply button in whatever enabled/disabled shape it currently takes. */
const APPLY_NAME = /Apply now|Applications closed|Applications full|Not open/

function applyControls(): HTMLButtonElement[] {
    return screen.queryAllByRole("button", { name: APPLY_NAME }) as HTMLButtonElement[]
}

// ── Tests ─────────────────────────────────────────────────────

describe("RecruitmentDetail", () => {
    describe("state 1 · viewer, not applied", () => {
        it("offers Apply and the bookmark, and no manage controls", () => {
            renderDetail()

            expect(screen.getAllByRole("button", { name: "Apply now" }).length).toBeGreaterThan(0)
            expect(screen.getAllByRole("button", { name: "Save recruitment" }).length).toBeGreaterThan(0)
            expect(screen.queryByText(/View applicants/)).toBeNull()
            expect(screen.queryByTestId("latest-applicants")).toBeNull()
        })

        it("shows a live countdown, not a closed one", () => {
            renderDetail()
            expect(screen.getAllByText(/Closes in 2d/).length).toBeGreaterThan(0)
        })

        // Report must survive the redesign at EVERY width. The desktop card's
        // flag icon is display:none on a phone, so the page-foot control is
        // the one that has to be there.
        it("keeps report reachable outside the desktop-only card", () => {
            renderDetail()
            expect(
                screen.getByRole("button", { name: /Report this recruitment/ })
            ).toBeTruthy()
        })

        it("never shows owner-only numbers", () => {
            // A non-owner payload carries no saves_count/views_count at all;
            // rendering them as 0 would invent a stat the server withheld.
            renderDetail()
            expect(screen.queryByText("views")).toBeNull()
            expect(screen.queryByText("saves")).toBeNull()
        })

        // ── The closed / full treatments ─────────────────────
        it("disables Apply and turns the countdown red once the deadline passes", () => {
            renderDetail({
                application_deadline: PAST,
                can_apply: false,
                is_accepting_applications: false,
            })

            const applies = applyControls()
            expect(applies.length).toBeGreaterThan(0)
            // EVERY copy must be dead, not just the one a given viewport shows.
            for (const el of applies) {
                expect(el.textContent).toContain("Applications closed")
                expect(el.disabled).toBe(true)
            }
            expect(screen.getAllByText(/^Closed /).length).toBeGreaterThan(0)
        })

        // A viewer never receives `status`, so without the public
        // is_accepting_applications fallback the chip would still be green
        // beside a dead Apply button.
        it("shows a closed countdown when closed early, with the deadline still ahead", () => {
            renderDetail({
                application_deadline: FAR_FUTURE,
                can_apply: false,
                is_accepting_applications: false,
            })

            expect(screen.getAllByText(/^Closed/).length).toBeGreaterThan(0)
            expect(screen.queryByText(/Closes in/)).toBeNull()
        })

        it("offers the save nudge once closed", () => {
            renderDetail({
                application_deadline: PAST,
                can_apply: false,
                is_accepting_applications: false,
            })

            expect(screen.getByRole("button", { name: /Save it for next season/ })).toBeTruthy()
        })

        // Capacity is worded differently from a closed deadline, because
        // "full" and "over" are different reasons to walk away.
        it("says 'Applications full' when the cap is hit", () => {
            renderDetail({
                applications_count: 50,
                max_applications: 50,
                can_apply: false,
                is_accepting_applications: false,
            })

            const applies = applyControls()
            expect(applies.length).toBeGreaterThan(0)
            for (const el of applies) {
                expect(el.textContent).toContain("Applications full")
                expect(el.disabled).toBe(true)
            }
        })

        it("has no save nudge while still open", () => {
            renderDetail()
            expect(screen.queryByRole("button", { name: /Save it for next season/ })).toBeNull()
        })
    })

    describe("state 2 · applied", () => {
        const applied: Partial<TRecruitmentDetail> = {
            can_apply: false,
            my_application: {
                id: "app-1",
                status: "reviewing",
                applied_at: PAST,
                updated_at: PAST,
                age_category: null,
            },
        }

        it("replaces Apply with the application's own home", () => {
            renderDetail(applied)

            expect(screen.getAllByText("Applied").length).toBeGreaterThan(0)
            expect(
                screen.getAllByRole("button", { name: "View application" }).length
            ).toBeGreaterThan(0)
            expect(screen.queryByRole("button", { name: "Apply now" })).toBeNull()
        })

        it("shows the status pill and when they applied", () => {
            renderDetail(applied)

            expect(screen.getAllByText("Reviewing").length).toBeGreaterThan(0)
            expect(screen.getByText(/You applied/)).toBeTruthy()
        })

        // Withdraw is reachable without hunting: the desktop card links to the
        // same sheet the mobile button opens.
        it("keeps a withdraw route visible", () => {
            renderDetail(applied)
            expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy()
        })
    })

    describe("state 3 · organiser", () => {
        const owner: Partial<TRecruitmentDetail> = {
            status: "active",
            views_count: 312,
            saves_count: 9,
            max_applications: 50,
            applications_count: 14,
            published_at: PAST,
        }

        it("shows the manage surface instead of Apply", () => {
            renderDetail(owner, { isOrgView: true })

            expect(screen.getAllByText(/View applicants/).length).toBeGreaterThan(0)
            expect(screen.queryByRole("button", { name: "Apply now" })).toBeNull()
            expect(screen.getByText("Organiser view")).toBeTruthy()
        })

        it("shows views · applied · saves and the capacity bar", () => {
            renderDetail(owner, { isOrgView: true })

            expect(screen.getAllByText("312").length).toBeGreaterThan(0)
            expect(screen.getAllByText("14").length).toBeGreaterThan(0)
            expect(screen.getAllByText("9").length).toBeGreaterThan(0)
            expect(screen.getAllByText("Capacity").length).toBeGreaterThan(0)
        })

        it("hides the capacity bar when no cap is set", () => {
            renderDetail({ ...owner, max_applications: null }, { isOrgView: true })
            expect(screen.queryByText("Capacity")).toBeNull()
        })

        it("replaces the bookmark with the status control", () => {
            renderDetail(owner, { isOrgView: true })

            expect(screen.queryAllByRole("button", { name: "Save recruitment" })).toHaveLength(0)
            expect(screen.getAllByRole("button", { name: /Active/ }).length).toBeGreaterThan(0)
        })

        // The club looking at its own listing has nothing to report.
        it("offers no report control", () => {
            renderDetail(owner, { isOrgView: true })
            expect(
                screen.queryByRole("button", { name: /Report this recruitment/ })
            ).toBeNull()
        })

        it("says the posting is theirs", () => {
            renderDetail(owner, { isOrgView: true })
            expect(screen.getByText(/Posted by you/)).toBeTruthy()
        })

        it("lists the latest applicants", () => {
            renderDetail(owner, { isOrgView: true })
            expect(screen.getByTestId("latest-applicants").textContent).toBe("14")
        })

        // The mockup's rule, and the one most likely to be lost in a refactor:
        // an organiser still has to manage a posting after it closes.
        it("keeps the manage surface when the recruitment is closed", () => {
            renderDetail(
                { ...owner, status: "closed", is_accepting_applications: false },
                { isOrgView: true }
            )

            expect(screen.getAllByText(/View applicants/).length).toBeGreaterThan(0)
            expect(screen.getAllByText(/^Closed/).length).toBeGreaterThan(0)
        })
    })

    describe("preview as player", () => {
        const owner: Partial<TRecruitmentDetail> = {
            status: "active",
            views_count: 312,
            saves_count: 9,
            applications_count: 14,
        }

        it("swaps to the viewer layout with Apply disabled", () => {
            renderDetail(owner, { isOrgView: true })

            fireEvent.click(
                screen.getByRole("button", { name: /See exactly what applicants see/ })
            )

            const apply = screen.getAllByRole("button", { name: "Apply now" })[0]
            expect((apply as HTMLButtonElement).disabled).toBe(true)
            expect(screen.getByText(/Organiser preview/)).toBeTruthy()
            // The manage surface is gone while previewing…
            expect(screen.queryByTestId("latest-applicants")).toBeNull()
            // …and the way back out is not.
            expect(screen.getByRole("button", { name: /Exit player preview/ })).toBeTruthy()
        })
    })

    /**
     * The bookmark and the organiser's status chip live in ONE place each,
     * chosen by viewport — the poster scrim on a phone, the state card on a
     * desktop. Two copies of the status chip would mean two StatusChangeMenus,
     * and the spare one can anchor its dropdown inside a hidden element.
     */
    describe("one control per viewport", () => {
        const owner: Partial<TRecruitmentDetail> = { status: "active", applications_count: 14 }

        it("gives the organiser exactly one status control on mobile", () => {
            renderDetail(owner, { isOrgView: true })
            expect(screen.getAllByRole("button", { name: /Active/ })).toHaveLength(1)
        })

        it("gives the organiser exactly one status control on desktop", () => {
            asDesktop()
            renderDetail(owner, { isOrgView: true })
            expect(screen.getAllByRole("button", { name: /Active/ })).toHaveLength(1)
        })

        it("gives a viewer exactly one bookmark on desktop", () => {
            asDesktop()
            renderDetail()
            expect(
                screen.getAllByRole("button", { name: "Save recruitment" })
            ).toHaveLength(1)
        })

        it("still offers Apply and report on desktop", () => {
            asDesktop()
            renderDetail()
            expect(screen.getAllByRole("button", { name: "Apply now" }).length).toBeGreaterThan(0)
            expect(
                screen.getByRole("button", { name: /Report this recruitment/ })
            ).toBeTruthy()
        })
    })

    describe("missing optional data", () => {
        // "No empty shells" — a section with nothing in it must not render a
        // heading over a blank space.
        it("omits sections with no data", () => {
            renderDetail({
                benefits: [],
                requirements: [],
                contacts: [],
                description: "",
                short_description: "",
            })

            expect(screen.queryByText("What you get")).toBeNull()
            expect(screen.queryByText("Bring with you")).toBeNull()
            expect(screen.queryByText("Contact")).toBeNull()
            expect(screen.queryByText("About")).toBeNull()
        })

        it("collapses the facts strip rather than showing empty cells", () => {
            const { container } = renderDetail({
                is_paid: false,
                fee_amount: null,
                venue_name: "",
                city: "",
                venue_link: "",
                event_date: null,
            })

            // Only "Free" survives — no dashes, no placeholder cells.
            expect(container.textContent).not.toContain("—")
        })

        it("still renders the title with no media at all", () => {
            renderDetail({ media: [] })

            expect(
                within(screen.getByRole("heading", { level: 1 })).getByText("Open Trials")
            ).toBeTruthy()
        })

        it("shows 'All positions' as the welcoming chip when none are listed", () => {
            renderDetail({ positions: [] })
            expect(screen.getByText("All positions")).toBeTruthy()
        })
    })
})
