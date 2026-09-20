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
import type { CreateRecruitmentMediaPayload } from "../../services/recruitments.api"

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
        experienceLevel: "",
        applicationDeadline: "",
        eventDate: "",
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
        experienceLevel: "district",
        applicationDeadline: "2026-10-08T18:30",
        eventDate: "2026-10-10",
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
            experience_level: "district",
            application_deadline: timedISO("2026-10-08T18:30"),
            event_date: endOfDayISO(2026, 10, 10),
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
            experience_level: undefined,
            application_deadline: undefined,
            event_date: endOfDayISO(2026, 11, 1),
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
