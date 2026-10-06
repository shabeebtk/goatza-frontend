/**
 * Characterisation test for `buildPayload` — what the wizard SENDS.
 *
 * The wizard's screens are free to move fields around; this file is the proof
 * that the request body did not move with them. Every expectation here is the
 * exact object literal the function produced on the day it was extracted from
 * the modal. If a change needs this file edited, that change altered the API
 * contract and must say so.
 *
 * Dates go through the local-time constructor on purpose: the wizard stores
 * "YYYY-MM-DD" and resolves it to 23:59 LOCAL, so the ISO string depends on
 * the machine's zone. Building the expected value the same way keeps the
 * assertion exact without pinning the suite to one time zone.
 */

import { describe, expect, it } from "vitest"

import { buildPayload } from "./buildPayload"
import type { RecruitmentDraft } from "./draft"
import {
    initialSessionDrafts,
    newSessionDraft,
    validateSessions,
} from "./sessions"
import type { SessionDraft } from "./sessions"
import type { CreateRecruitmentMediaPayload } from "../../services/recruitments.api"
import type { PlaceResult } from "@/shared/services/places.service"

/** A date row, stated as briefly as a test needs it. */
function sessionDraft(overrides: Partial<SessionDraft>): SessionDraft {
    return { ...newSessionDraft(), ...overrides }
}

/** A picked place, as PostLocationPicker hands one over. */
function place(overrides: Partial<PlaceResult> = {}): PlaceResult {
    return {
        provider: "google",
        place_type: "place",
        label: "North Ground, Kerala, IN",
        name: "North Ground",
        city: "Kannur",
        state: "Kerala",
        country: "India",
        country_code: "IN",
        latitude: 11.8745,
        longitude: 75.3704,
        external_id: "ChIJ-north",
        types: ["stadium"],
        ...overrides,
    }
}

const endOfDayISO = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d, 23, 59, 0, 0).toISOString()
const timedISO = (v: string) => new Date(v).toISOString()

/** A blank wizard, exactly as the modal initialises it in create mode. */
function emptyDraft(): RecruitmentDraft {
    return {
        title: "",
        shortDesc: "",
        description: "",
        recruitmentType: "open_trial",
        visibility: "public",
        gender: "all",
        sportId: "",
        applicationDeadline: "",
        eventDate: "",
        // What the modal starts an open trial with: exactly ONE empty
        // date row, which sends nothing until it is filled in.
        sessions: initialSessionDrafts(),
        sessionMode: "all",
        autoConfirm: false,
        maxApplications: "",
        isPaid: false,
        feeAmount: "",
        feeCurrency: "INR",
        paymentNote: "",
        applyMethod: "goatza",
        externalApplyUrl: "",
        venueName: "",
        venueLink: "",
        location: null,
        anyPosition: true,
        selectedPositions: [],
        ageCategories: [],
        allAges: true,
        eligibilityCriteria: [],
        benefits: [],
        requirements: [],
        contacts: [],
        questions: [],
    }
}

function fullDraft(): RecruitmentDraft {
    return {
        title: "  U17 Football Open Trial — Kannur  ",
        shortDesc: " Two-day selection for the academy squad ",
        description: "  What to expect\nWarm-up, drills, 7-a-side games.  ",
        recruitmentType: "open_trial",
        visibility: "followers_only",
        gender: "male",
        sportId: "sport-football",
        applicationDeadline: "2026-10-08T18:30",
        eventDate: "2026-10-10",
        // Two dates, each its own round. `id` on the first is a row that
        // came back from the API and MUST go back out carrying it.
        sessions: [
            sessionDraft({ id: "sess-1", date: "2026-10-10", startTime: "09:00" }),
            sessionDraft({
                date: "2026-10-11",
                title: "  Day 2  ",
                endTime: "17:00",
                venueName: "  Kozhikode Corporation Stadium ",
            }),
        ],
        sessionMode: "choose_one",
        autoConfirm: true,
        maxApplications: "150",
        isPaid: true,
        feeAmount: "300",
        feeCurrency: "INR",
        paymentNote: "  Cash on the day  ",
        applyMethod: "goatza",
        externalApplyUrl: "https://ignored.example/apply",
        venueName: "  Kannur Municipal Stadium ",
        venueLink: " https://maps.google.com/?q=stadium ",
        location: {
            provider: "google",
            label: "Kannur, IN",
            name: "Kannur",
            place_type: "city",
            city: "Kannur",
            state: "Kerala",
            country: "India",
            country_code: "IN",
            latitude: 11.8745,
            longitude: 75.3704,
            external_id: "ChIJ-kannur",
            types: ["locality"],
        },
        anyPosition: false,
        selectedPositions: [
            { position_id: "pos-gk", name: "Goalkeeper" },
            { position_id: "pos-st", name: "Striker" },
        ],
        allAges: false,
        ageCategories: [
            {
                id: "local-1",
                title: " U15 ",
                min_birth_year: 2011,
                max_birth_year: 2012,
                reporting_time: "08:30",
                showReportingTime: true,
                display_order: 0,
            },
            {
                id: "local-2",
                title: "U17",
                min_birth_year: 2009,
                max_birth_year: null,
                reporting_time: "10:00",
                showReportingTime: false,
                display_order: 1,
            },
        ],
        eligibilityCriteria: [
            { id: "c1", title: " Kerala residents only ", display_order: 0 },
            { id: "c2", title: "   ", display_order: 1 },
            { id: "c3", title: "School students only", display_order: 2 },
        ],
        benefits: [
            { id: "b1", title: " Professional coaching ", icon_name: "coach", display_order: 0 },
            { id: "b2", title: "Full kit", icon_name: "kit", display_order: 1 },
        ],
        requirements: [
            { id: "r1", title: "Aadhaar Card", is_mandatory: true, display_order: 0 },
            { id: "r2", title: " Boots ", is_mandatory: false, display_order: 1 },
        ],
        contacts: [
            { id: "k1", name: " Coach Ravi ", contact_type: "phone", value: " +919876543210 " },
            { id: "k2", name: "", contact_type: "email", value: "trials@club.example" },
            { id: "k3", name: "Blank", contact_type: "phone", value: "   " },
        ],
        questions: [
            {
                id: "q1",
                question: " Which club did you last play for? ",
                field_type: "short_text",
                is_required: true,
                options: [],
            },
            {
                id: "q2",
                question: "Preferred foot",
                field_type: "radio",
                is_required: false,
                options: [{ value: " Left " }, { value: "Right" }, { value: "  " }],
            },
            {
                id: "q3",
                question: "Height in cm",
                field_type: "number",
                is_required: false,
                options: [],
            },
            {
                id: "q4",
                question: "   ",
                field_type: "long_text",
                is_required: false,
                options: [],
            },
        ],
    }
}

const THREE_MEDIA: CreateRecruitmentMediaPayload[] = [
    { file_url: "https://media/a.webp", public_id: "rec/a", media_type: "image", order: 0, thumbnail_url: "https://media/a_t.webp" },
    { file_url: "https://media/b.webp", public_id: "rec/b", media_type: "image", order: 1, thumbnail_url: "https://media/b_t.webp" },
    { file_url: "https://media/c.webp", public_id: "rec/c", media_type: "image", order: 2 },
]

describe("buildPayload", () => {
    it("full draft — every field populated, publishing", () => {
        expect(buildPayload(fullDraft(), THREE_MEDIA, "active")).toEqual({
            title: "U17 Football Open Trial — Kannur",
            short_description: "Two-day selection for the academy squad",
            description: "What to expect\nWarm-up, drills, 7-a-side games.",
            recruitment_type: "open_trial",
            visibility: "followers_only",
            gender: "male",
            sport_id: "sport-football",
            application_deadline: timedISO("2026-10-08T18:30"),
            event_date: endOfDayISO(2026, 10, 10),
            sessions: [
                {
                    id: "sess-1",
                    date: "2026-10-10",
                    start_time: "09:00",
                    display_order: 0,
                },
                {
                    date: "2026-10-11",
                    title: "Day 2",
                    end_time: "17:00",
                    venue_name: "Kozhikode Corporation Stadium",
                    display_order: 1,
                },
            ],
            session_mode: "choose_one",
            auto_confirm: true,
            max_applications: 150,
            is_paid: true,
            fee_amount: "300",
            fee_currency: "INR",
            payment_note: "Cash on the day",
            apply_method: "goatza",
            external_apply_url: undefined,
            status: "active",
            venue_name: "Kannur Municipal Stadium",
            venue_link: "https://maps.google.com/?q=stadium",
            location: {
                provider: "google",
                external_id: "ChIJ-kannur",
                name: "Kannur",
                type: "city",
                city: "Kannur",
                state: "Kerala",
                country: "India",
                country_code: "IN",
                latitude: 11.8745,
                longitude: 75.3704,
            },
            positions: [{ position_id: "pos-gk" }, { position_id: "pos-st" }],
            age_categories: [
                {
                    title: "U15",
                    min_birth_year: 2011,
                    max_birth_year: 2012,
                    reporting_time: "08:30:00",
                    display_order: 0,
                },
                {
                    title: "U17",
                    min_birth_year: 2009,
                    max_birth_year: null,
                    reporting_time: undefined,
                    display_order: 1,
                },
            ],
            eligibility_criteria: [
                { title: "Kerala residents only", display_order: 0 },
                { title: "School students only", display_order: 1 },
            ],
            benefits: [
                { title: "Professional coaching", icon_name: "coach", display_order: 0 },
                { title: "Full kit", icon_name: "kit", display_order: 1 },
            ],
            requirements: [
                { title: "Aadhaar Card", is_mandatory: true, display_order: 0 },
                { title: "Boots", is_mandatory: false, display_order: 1 },
            ],
            contacts: [
                { name: "Coach Ravi", contact_type: "phone", value: "+919876543210" },
                { name: "", contact_type: "email", value: "trials@club.example" },
            ],
            questions: [
                {
                    question: "Which club did you last play for?",
                    field_type: "short_text",
                    is_required: true,
                    options: [],
                },
                {
                    question: "Preferred foot",
                    field_type: "radio",
                    is_required: false,
                    options: [{ value: "Left" }, { value: "Right" }],
                },
                {
                    question: "Height in cm",
                    field_type: "number",
                    is_required: false,
                    options: [],
                },
            ],
            media: THREE_MEDIA,
        })
    })

    it("minimal draft — title, sport and event date only", () => {
        const draft = {
            ...emptyDraft(),
            title: "Open trial",
            sportId: "sport-cricket",
            eventDate: "2026-11-01",
        }
        expect(buildPayload(draft, [], "active")).toEqual({
            title: "Open trial",
            short_description: "",
            description: undefined,
            recruitment_type: "open_trial",
            visibility: "public",
            gender: "all",
            sport_id: "sport-cricket",
            application_deadline: undefined,
            event_date: endOfDayISO(2026, 11, 1),
            // The one blank row carries no date, so nothing is sent for
            // it - and with fewer than two dates the mode is always all.
            sessions: [],
            session_mode: "all",
            auto_confirm: false,
            max_applications: undefined,
            is_paid: false,
            fee_amount: undefined,
            fee_currency: undefined,
            payment_note: undefined,
            apply_method: "goatza",
            external_apply_url: undefined,
            status: "active",
            venue_name: undefined,
            venue_link: undefined,
            location: undefined,
            positions: [],
            age_categories: [],
            eligibility_criteria: [],
            benefits: [],
            requirements: [],
            contacts: [],
            questions: [],
            media: undefined,
        })
    })

    it("minimal draft saved as a draft carries status: draft", () => {
        const draft = { ...emptyDraft(), title: "Open trial", sportId: "s", eventDate: "2026-11-01" }
        expect(buildPayload(draft, [], "draft").status).toBe("draft")
    })

    // ── Trial dates ──────────────────────────────────────────────

    it("a date row loaded from the API keeps its id — the whole edit contract", () => {
        // The backend DIFF-SYNCS on this id. A row that arrives without one
        // is created, and the row it replaced is DELETED — which SET_NULLs
        // the date every applicant picked. This assertion is the guard.
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            title: "City tour",
            sportId: "sport-football",
            sessions: [
                sessionDraft({ id: "sess-kochi", date: "2026-10-10" }),
                sessionDraft({ id: "sess-calicut", date: "2026-10-17" }),
                sessionDraft({ date: "2026-10-24" }),
            ],
            sessionMode: "choose_one",
        }

        expect(buildPayload(draft, []).sessions).toEqual([
            { id: "sess-kochi", date: "2026-10-10", display_order: 0 },
            { id: "sess-calicut", date: "2026-10-17", display_order: 1 },
            { date: "2026-10-24", display_order: 2 },
        ])
    })

    it("forces `all` below two live dates, and honours the choice above", () => {
        const one: RecruitmentDraft = {
            ...emptyDraft(),
            sessions: [sessionDraft({ date: "2026-10-10" })],
            sessionMode: "choose_one",
        }
        expect(buildPayload(one, []).session_mode).toBe("all")

        const two: RecruitmentDraft = {
            ...one,
            sessions: [
                sessionDraft({ date: "2026-10-10" }),
                sessionDraft({ date: "2026-10-11" }),
            ],
        }
        expect(buildPayload(two, []).session_mode).toBe("choose_one")

        // A cancelled second date is not a second date.
        const cancelled: RecruitmentDraft = {
            ...one,
            sessions: [
                sessionDraft({ date: "2026-10-10" }),
                sessionDraft({ date: "2026-10-11", isCancelled: true }),
            ],
        }
        expect(buildPayload(cancelled, []).session_mode).toBe("all")
    })

    it("a `looking for players` post sends no dates and no trial settings", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            recruitmentType: "player_looking",
            title: "Goalkeeper wanted",
            sportId: "sport-football",
            // Left over from a switch away from open_trial: none of it rides
            // along.
            sessions: [sessionDraft({ date: "2026-10-10" })],
            sessionMode: "choose_one",
            autoConfirm: true,
        }

        const payload = buildPayload(draft, [])
        expect(payload.sessions).toBeUndefined()
        expect(payload.session_mode).toBeUndefined()
        expect(payload.auto_confirm).toBeUndefined()
        expect(payload.event_date).toBeUndefined()
    })

    it("multi_place — every centre sends its own location block", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            title: "Zone trials",
            sportId: "sport-football",
            trialShape: "multi_place",
            sessions: [
                sessionDraft({
                    date: "2026-10-10", startTime: "09:00",
                    venueName: " North Ground ",
                    location: place({
                        external_id: "ChIJ-north", name: "North Ground",
                        city: "Kannur",
                    }),
                }),
                sessionDraft({
                    date: "2026-10-10", startTime: "09:00",
                    location: place({
                        external_id: "ChIJ-south", name: "South Ground",
                        // A ground outside any named locality: the serializer
                        // reads a MISSING city as a validation error, so the
                        // place name has to stand in.
                        city: "",
                    }),
                }),
            ],
        }

        const sessions = buildPayload(draft, []).sessions!

        expect(sessions[0].location).toEqual({
            provider: "google",
            external_id: "ChIJ-north",
            name: "North Ground",
            type: "place",
            city: "Kannur",
            state: "Kerala",
            country: "India",
            country_code: "IN",
            latitude: 11.8745,
            longitude: 75.3704,
        })
        // `city` is NEVER undefined — it falls back to the place name.
        expect(sessions[1].location!.city).toBe("South Ground")
        expect(sessions[1].location!.city).not.toBeUndefined()
    })

    it("multi_place — the mode is choose_one, whatever the radios said", () => {
        // Several CENTRES is a pick-one by definition: a player attends one
        // ground, not all of them.
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            trialShape: "multi_place",
            sessionMode: "all",
            sessions: [
                sessionDraft({ date: "2026-10-10", location: place() }),
                sessionDraft({
                    date: "2026-10-17",
                    location: place({ external_id: "ChIJ-south" }),
                }),
            ],
        }

        expect(buildPayload(draft, []).session_mode).toBe("choose_one")
    })

    it("single — the mode is `all` and no centre sends a location", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            trialShape: "single",
            // Left behind by a switch out of multi_place: none of it rides
            // along, because one day has no per-row venue at all.
            sessionMode: "choose_one",
            sessions: [sessionDraft({ date: "2026-10-10" })],
        }

        const payload = buildPayload(draft, [])

        expect(payload.session_mode).toBe("all")
        expect(payload.sessions).toEqual([
            { date: "2026-10-10", display_order: 0 },
        ])
        expect(payload.sessions![0].location).toBeUndefined()
    })

    it("multi_day — the org's own answer survives", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            trialShape: "multi_day",
            sessionMode: "choose_one",
            sessions: [
                sessionDraft({ date: "2026-10-10" }),
                sessionDraft({ date: "2026-10-17" }),
            ],
        }
        expect(buildPayload(draft, []).session_mode).toBe("choose_one")

        expect(
            buildPayload({ ...draft, sessionMode: "all" }, []).session_mode,
        ).toBe("all")
    })

    it("a draft with NO shape reads it back off its rows", () => {
        // `trialShape` is optional and derivable — a row with its own venue
        // is a centre, which makes the trial multi_place and the mode a
        // pick-one even though nothing said so.
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            sessionMode: "all",
            sessions: [
                sessionDraft({ date: "2026-10-10", location: place() }),
                sessionDraft({ date: "2026-10-17" }),
            ],
        }
        expect(draft.trialShape).toBeUndefined()
        expect(buildPayload(draft, []).session_mode).toBe("choose_one")
    })

    it("edit — a centre's server id round-trips WITH its location", () => {
        // THE DESTRUCTIVE CASE the module docstring warns about: the backend
        // diff-syncs on `id`, so a row that arrives without one is created
        // and the row it replaced is DELETED — which SET_NULLs the centre
        // every applicant picked. Adding a location block must not cost the
        // id.
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            trialShape: "multi_place",
            sessions: [
                sessionDraft({
                    id: "sess-north", date: "2026-10-10",
                    location: place({ external_id: "ChIJ-north" }),
                }),
                sessionDraft({
                    id: "sess-south", date: "2026-10-17",
                    location: place({ external_id: "ChIJ-south" }),
                }),
                // A centre the org just added: no id, so the server creates it.
                sessionDraft({
                    date: "2026-10-24",
                    location: place({ external_id: "ChIJ-east" }),
                }),
            ],
        }

        const sessions = buildPayload(draft, []).sessions!

        expect(sessions.map((s) => s.id)).toEqual([
            "sess-north", "sess-south", undefined,
        ])
        expect(sessions.map((s) => s.location!.external_id)).toEqual([
            "ChIJ-north", "ChIJ-south", "ChIJ-east",
        ])
        // ...and display_order still says which is which.
        expect(sessions.map((s) => s.display_order)).toEqual([0, 1, 2])
    })

    it("a cancelled date is sent, not dropped — applicants still see it", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            sessions: [
                sessionDraft({ id: "sess-1", date: "2026-10-10" }),
                sessionDraft({ id: "sess-2", date: "2026-10-11", isCancelled: true }),
            ],
        }
        expect(buildPayload(draft, []).sessions).toEqual([
            { id: "sess-1", date: "2026-10-10", display_order: 0 },
            { id: "sess-2", date: "2026-10-11", is_cancelled: true, display_order: 1 },
        ])
    })

    it("edit draft — pre-existing age groups keep their server id, new ones do not", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            title: "Academy intake",
            sportId: "sport-football",
            eventDate: "2026-12-05",
            allAges: false,
            ageCategories: [
                {
                    id: "local-a",
                    serverId: "srv-u13",
                    title: "U13",
                    min_birth_year: 2013,
                    max_birth_year: 2014,
                    reporting_time: "",
                    showReportingTime: false,
                    display_order: 0,
                },
                {
                    id: "local-b",
                    serverId: "srv-u15",
                    title: "U15",
                    min_birth_year: 2011,
                    max_birth_year: 2012,
                    reporting_time: "09:00",
                    showReportingTime: true,
                    display_order: 1,
                },
                {
                    id: "local-c",
                    title: "U17",
                    min_birth_year: 2009,
                    max_birth_year: 2010,
                    reporting_time: "",
                    showReportingTime: false,
                    display_order: 2,
                },
            ],
        }
        // Edit mode passes no submitStatus: the body carries no `status` key.
        const payload = buildPayload(draft, [], undefined)
        expect("status" in payload).toBe(false)
        expect(payload.age_categories).toEqual([
            { id: "srv-u13", title: "U13", min_birth_year: 2013, max_birth_year: 2014, reporting_time: undefined, display_order: 0 },
            { id: "srv-u15", title: "U15", min_birth_year: 2011, max_birth_year: 2012, reporting_time: "09:00:00", display_order: 1 },
            { title: "U17", min_birth_year: 2009, max_birth_year: 2010, reporting_time: undefined, display_order: 2 },
        ])
    })

    // Phase 1.7 — the ONE deliberate contract change: publishing a saved draft
    // from the edit wizard now carries `status: "active"`. Every other edit
    // still sends no status key (the case above).
    it("edit draft being published carries status: active", () => {
        const draft = { ...emptyDraft(), title: "Academy intake", sportId: "s", eventDate: "2026-12-05" }
        expect(buildPayload(draft, [], "active").status).toBe("active")
    })

    it("open to all ages submits [] even when groups were authored", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            allAges: true,
            ageCategories: [{
                id: "x", title: "U19", min_birth_year: 2007, max_birth_year: 2008,
                reporting_time: "", showReportingTime: false, display_order: 0,
            }],
        }
        expect(buildPayload(draft, []).age_categories).toEqual([])
    })

    it('apply_method: "external" sends the trimmed URL', () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            applyMethod: "external",
            externalApplyUrl: "  https://club.example/apply  ",
        }
        const payload = buildPayload(draft, [])
        expect(payload.apply_method).toBe("external")
        expect(payload.external_apply_url).toBe("https://club.example/apply")
    })

    it('apply_method: "external" with a blank URL sends undefined', () => {
        const draft: RecruitmentDraft = { ...emptyDraft(), applyMethod: "external", externalApplyUrl: "   " }
        expect(buildPayload(draft, []).external_apply_url).toBeUndefined()
    })

    it('apply_method: "contact" drops the URL and keeps only filled contacts', () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            applyMethod: "contact",
            externalApplyUrl: "https://ignored.example",
            contacts: [
                { id: "1", name: "", contact_type: "phone", value: "9876543210" },
                { id: "2", name: "Empty", contact_type: "email", value: "" },
            ],
        }
        const payload = buildPayload(draft, [])
        expect(payload.apply_method).toBe("contact")
        expect(payload.external_apply_url).toBeUndefined()
        expect(payload.contacts).toEqual([{ name: "", contact_type: "phone", value: "9876543210" }])
    })

    /**
     * Custom questions are only ever ASKED by the in-app apply form. Sending
     * them with any other method half-configures a posting that can never
     * collect an answer, and on an edit it would write rows nothing reads.
     * The wizard keeps them in its draft state — a toggle must not destroy
     * typed work — so the payload is the one place they are dropped.
     */
    const withQuestions = (applyMethod: RecruitmentDraft["applyMethod"]): RecruitmentDraft => ({
        ...emptyDraft(),
        applyMethod,
        externalApplyUrl: "https://club.example/apply",
        contacts: [{ id: "1", name: "", contact_type: "phone", value: "9876543210" }],
        questions: [
            { id: "q1", question: " Which foot? ", field_type: "short_text", is_required: true, options: [] },
        ],
    })

    it('apply_method: "goatza" sends the questions', () => {
        expect(buildPayload(withQuestions("goatza"), []).questions).toEqual([
            { question: "Which foot?", field_type: "short_text", is_required: true, options: [] },
        ])
    })

    it("omits `questions` entirely for every apply method but goatza", () => {
        for (const method of ["external", "contact"] as const) {
            const payload = buildPayload(withQuestions(method), [])
            expect(payload.questions).toBeUndefined()
            // Omitted, not emptied: an UPDATE that sends [] would be an
            // instruction to delete, and an empty array is not "no opinion".
            expect("questions" in payload && payload.questions !== undefined).toBe(false)
        }
    })

    it("a free recruitment sends no fee fields even when they were typed", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            isPaid: false,
            feeAmount: "500",
            feeCurrency: "USD",
            paymentNote: "note",
        }
        const payload = buildPayload(draft, [])
        expect(payload.is_paid).toBe(false)
        expect(payload.fee_amount).toBeUndefined()
        expect(payload.fee_currency).toBeUndefined()
        expect(payload.payment_note).toBeUndefined()
    })

    it("a place with no city falls back to the place name for `city`", () => {
        const draft: RecruitmentDraft = {
            ...emptyDraft(),
            location: {
                provider: "google",
                label: "Some Ground",
                name: "Some Ground",
                place_type: "place",
                city: "",
                state: "Kerala",
                country: "India",
                country_code: "IN",
                latitude: 11.1,
                longitude: 75.1,
                external_id: "ChIJ-ground",
                types: [],
            },
        }
        expect(buildPayload(draft, []).location).toEqual({
            provider: "google",
            external_id: "ChIJ-ground",
            name: "Some Ground",
            type: "place",
            city: "Some Ground",
            state: "Kerala",
            country: "India",
            country_code: "IN",
            latitude: 11.1,
            longitude: 75.1,
        })
    })

    it("a timed date-only pair: event date resolves to end of day, timed deadline to its minute", () => {
        const draft = { ...emptyDraft(), eventDate: "2026-10-10", applicationDeadline: "2026-10-10T09:00" }
        const payload = buildPayload(draft, [])
        expect(payload.event_date).toBe(endOfDayISO(2026, 10, 10))
        expect(payload.application_deadline).toBe(timedISO("2026-10-10T09:00"))
    })
})
describe("validateSessions", () => {
    it("wants at least one live date", () => {
        expect(validateSessions(initialSessionDrafts(), "")).toBe(
            "Add at least one trial date.",
        )
        expect(
            validateSessions([sessionDraft({ date: "2026-10-10", isCancelled: true })], ""),
        ).toBe("Add at least one trial date.")
        expect(validateSessions([sessionDraft({ date: "2026-10-10" })], "")).toBeNull()
    })

    it("refuses two dates at the same date, time AND venue", () => {
        // Both rows inherit the trial's venue, so there is one place and one
        // slot: the second row is a mistake, not a second centre.
        const same = [
            sessionDraft({ date: "2026-10-10", startTime: "09:00" }),
            sessionDraft({ date: "2026-10-10", startTime: "09:00" }),
        ]
        expect(validateSessions(same, "")).toBe(
            "Two trial dates are the same date, time and venue. " +
            "Remove the duplicate.",
        )

        // A second slot on the same day is a real thing — morning and
        // afternoon rounds.
        const differentTimes = [
            sessionDraft({ date: "2026-10-10", startTime: "09:00" }),
            sessionDraft({ date: "2026-10-10", startTime: "14:00" }),
        ]
        expect(validateSessions(differentTimes, "")).toBeNull()
    })

    it("allows two VENUES at one date and time — a North and a South zone", () => {
        // The format the old rule refused outright. Two grounds sharing a
        // Saturday morning are two centres.
        const twoPlaces = [
            sessionDraft({
                date: "2026-10-10", startTime: "09:00",
                location: place({ external_id: "ChIJ-north", name: "North Ground" }),
            }),
            sessionDraft({
                date: "2026-10-10", startTime: "09:00",
                location: place({ external_id: "ChIJ-south", name: "South Ground" }),
            }),
        ]
        expect(validateSessions(twoPlaces, "")).toBeNull()

        // Typed by hand instead of picked: still two venues.
        const twoNames = [
            sessionDraft({ date: "2026-10-10", startTime: "09:00", venueName: "North Ground" }),
            sessionDraft({ date: "2026-10-10", startTime: "09:00", venueName: "South Ground" }),
        ]
        expect(validateSessions(twoNames, "")).toBeNull()
    })

    it("still refuses the SAME venue twice at one slot", () => {
        const samePlace = [
            sessionDraft({
                date: "2026-10-10", startTime: "09:00", location: place(),
            }),
            sessionDraft({
                date: "2026-10-10", startTime: "09:00", location: place(),
            }),
        ]
        expect(validateSessions(samePlace, "")).not.toBeNull()

        // Normalized, so case and padding do not mint a second centre.
        const sameName = [
            sessionDraft({ date: "2026-10-10", startTime: "09:00", venueName: "North Ground" }),
            sessionDraft({ date: "2026-10-10", startTime: "09:00", venueName: "  north ground " }),
        ]
        expect(validateSessions(sameName, "")).not.toBeNull()
    })

    it("keeps the deadline on or before the FIRST date", () => {
        // Rows in any order: the earliest one is the trial's start.
        const rows = [
            sessionDraft({ date: "2026-10-17" }),
            sessionDraft({ date: "2026-10-10" }),
        ]

        expect(validateSessions(rows, "2026-10-08")).toBeNull()
        // ...on the day itself is fine (a date-only deadline is end of day,
        // and so is a date-only trial).
        expect(validateSessions(rows, "2026-10-10")).toBeNull()

        expect(validateSessions(rows, "2026-10-12")).toBe(
            "The application deadline is after the first trial date. " +
            "Move the deadline to on or before 10 Oct 2026.",
        )
    })
})
