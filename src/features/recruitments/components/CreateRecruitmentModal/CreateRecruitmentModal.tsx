"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import dayjs from "dayjs"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import imageCompression from "browser-image-compression"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Select from "@/shared/components/ui/Select/Select"
import PostLocationPicker from "@/features/posts/components/PostLocationPicker/PostLocationPicker"
import PostImageCropper, { type CropState } from "@/features/posts/components/PostImageCropper/PostImageCropper"
import {
    POSTER_THUMB_MAX_DIMENSION,
    imageFileName,
    makeThumb,
    preferredImageType,
} from "@/shared/services/imageVariants"
import {
    UPLOAD_CANCELLED,
    describeBlob,
    getUploadConfigApi,
    putToR2,
} from "@/shared/services/mediaUpload"
import { isUploadCancellation } from "@/shared/services/apiError"
import UploadOverlay from "@/shared/components/ui/UploadOverlay/UploadOverlay"
import type { PlaceResult } from "@/shared/services/places.service"
import { useProfileBias } from "@/features/profile/hooks/useProfileBias"
import { useAuthStore } from "@/store/auth.store"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import styles from "./CreateRecruitmentModal.module.css"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage, getApiFieldErrors } from "@/core/api/getApiErrorMessage"
import { useCreateRecruitment, useUpdateRecruitment, useChangeRecruitmentStatus, useRecruitmentsList } from "../../hooks/useRecruitments"
import {
    fetchRecruitmentDetailApi,
    type Recruitment,
    type RecruitmentDetail,
    type CreateRecruitmentMediaPayload,
    type ApplyMethod,
    type SessionMode,
} from "../../services/recruitments.api"
import {
    MIN_BIRTH_YEAR,
    formatBirthYears,
    validateAgeGroups,
    type AgeGroupDraft,
} from "../../eligibility"
import type {
    RecruitmentType,
    RecruitmentVisibility,
    RecruitmentGender,
    QuestionFieldType,
    QuestionDraft,
    EligibilityCriteriaDraft,
    BenefitDraft,
    RequirementDraft,
    ContactDraft,
    PositionItem,
    RecruitmentDraft,
} from "./draft"
import { buildPayload } from "./buildPayload"
import {
    addSessionDraft,
    firstSession,
    initialSessionDrafts,
    mapsLinkFor,
    sessionDateValue,
    sessionsFromApi,
    shapeFromSessions,
    titleForPlace,
    validateSessions,
    withDateValue,
    withDefaultStart,
} from "./sessions"
import type { SessionDraft, TrialShape } from "./sessions"
import { isoToLocalInput, parseLocalInput } from "./wizardDate"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import { useFocusedFieldVisible } from "@/shared/hooks/useFocusedFieldVisible"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { useBackToClose, type BackToClose } from "@/shared/hooks/useBackToClose"
import { BENEFIT_ICON_OPTIONS, VISIBILITY_LABEL } from "../../recruitmentCopy"
import TypePicker from "./TypePicker"
import type { RecruitmentTemplate } from "./templates"
import RecruitmentPreview, { type PreviewJumpTarget } from "./RecruitmentPreview"
import { draftToPreviewRecruitment, missingFromDraft, type MissingItem } from "./draftToPreviewRecruitment"
import { clipboardToMarkdownLite } from "../../pasteToMarkdownLite"
import {
    TYPE_CONFIG,
    STEP_META,
    FIELD_STEP_KEY,
    toCreatableType,
    type StepKey,
    type HideableField,
} from "./typeConfig"

// ── Types ─────────────────────────────────────────────────────

export type { RecruitmentType, RecruitmentVisibility, RecruitmentGender, QuestionFieldType } from "./draft"

type UploadedMedia = {
    file_url: string
    public_id: string
    media_type: "image" | "video"
    thumbnail_url?: string
    order: number
}

type MediaEntry = {
    id: string
    file: File | null            // current (possibly cropped) file that gets uploaded
    originalFile: File | null    // untouched source — re-cropping always starts here
    preview: string
    progress: number
    status: "idle" | "uploading" | "done" | "error"
    error: string | null
    result: UploadedMedia | null
    existing?: boolean           // true → already on the server, skip the upload pipeline
    crop?: CropState             // saved reposition so re-opening the cropper resumes
    zoom?: number
}

type SubmitPhase = "idle" | "uploading" | "posting" | "done"


/**
 * The recruitment media standard: 4:5 PORTRAIT, fixed.
 *
 * The poster stage this feeds (RecruitmentHeroCarousel) is a 4:5 frame, so
 * the cropper cuts to the shape the photo will be shown in. There used to be
 * a 4:5 / 1:1 switch here; it was never saved or sent, reset whenever the
 * step was left, and the hero rendered 4:5 regardless — a control with no
 * effect. One shape, one cropper.
 */
const MEDIA_ASPECT = 4 / 5

// Mirror the posts image pipeline: compress before upload so recruitment
// photos use the same sizes/formats as feed photos. The format comes from
// `preferredImageType` at upload time — WebP where the browser can write it,
// JPEG otherwise (an iPhone asked for WebP quietly returns PNG).
const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 2.5,
    maxWidthOrHeight: 2560,
    initialQuality: 0.9,
    useWebWorker: true,
}

// Time picker options at clean 30-minute steps (00 / 30).
function fmtTimeLabel(value: string): string {
    const [hs = "0", ms = "00"] = value.split(":")
    const h = Number(hs)
    const ampm = h < 12 ? "AM" : "PM"
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${ms} ${ampm}`
}

const TIME_OPTIONS: { value: string; label: string }[] = (() => {
    const out: { value: string; label: string }[] = []
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
            const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
            out.push({ value, label: fmtTimeLabel(value) })
        }
    }
    return out
})()

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
    } catch {
        return false
    }
}

const PHONE_RE = /^\+?\d{7,15}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Preset age categories ──────────────────────────────────────

// Read at the moment it is needed, never at import: a tab left open across
// 1 January would otherwise keep offering last year's birth years.
const currentYear = () => new Date().getFullYear()

const AGE_PRESETS = [
    { label: "U13", maxAge: 13 },
    { label: "U15", maxAge: 15 },
    { label: "U17", maxAge: 17 },
    { label: "U18", maxAge: 18 },
    { label: "U19", maxAge: 19 },
    { label: "U21", maxAge: 21 },
    { label: "U23", maxAge: 23 },
]

function ageToYears(maxAge: number, year: number) {
    // e.g. U17: born 2008 or 2009 for current year
    const maxBirth = year - (maxAge - 1)
    const minBirth = year - maxAge
    return { min_birth_year: minBirth, max_birth_year: maxBirth }
}

/**
 * An EMPTY age group, ready to be named.
 *
 * Shared by the "Custom" chip and the state a new recruitment opens on: a
 * specific age group is what nearly every trial wants, so the row is already
 * there and a preset chip fills it in one tap (see `addPreset`).
 */
function newAgeGroup(year: number, displayOrder: number): AgeGroupDraft {
    return {
        id: uid(),
        title: "",
        min_birth_year: year - 18,
        max_birth_year: year - 17,
        reporting_time: "",
        showReportingTime: false,
        display_order: displayOrder,
    }
}

// ── Benefit icon options ───────────────────────────────────────
// One list for the picker AND the detail pages — see recruitmentCopy.ts.
const BENEFIT_ICONS = BENEFIT_ICON_OPTIONS

// What the toast calls a field when a check fails.
const FIELD_LABEL: Record<string, string> = {
    title: "Title",
    short_description: "Card tagline",
    sport_id: "Sport",
    event_date: "Date",
    application_deadline: "Deadline",
    venue_link: "Venue map link",
    venue_name: "Venue name",
    location: "Location",
    age_categories: "Age groups",
    questions: "Application questions",
    external_apply_url: "Application link",
    contacts: "Contacts",
    fee_amount: "Fee amount",
    max_applications: "Max applications",
    media: "Photos",
    positions: "Positions",
    description: "Full description",
    visibility: "Visibility",
}

// The preview's prompts and the "still missing" list point at fields.
const PREVIEW_JUMP_FIELD: Record<PreviewJumpTarget, string> = {
    photos: "media",
    date: "event_date",
    location: "location",
    description: "description",
    contact: "contacts",
    tagline: "short_description",
    deadline: "application_deadline",
    title: "title",
}
const MISSING_FIELD: Record<MissingItem["key"], string> = {
    photos: "media",
    deadline: "application_deadline",
    location: "location",
    contact: "contacts",
    description: "description",
    tagline: "short_description",
}

// "Publish publicly" — the verb's adverb, per visibility.
const VISIBILITY_ADVERB: Record<RecruitmentVisibility, string> = {
    public: "publicly",
    followers_only: "to followers",
    private: "privately",
}
const VISIBILITY_OPTIONS: { value: RecruitmentVisibility; label: string; hint: string; icon: string }[] = [
    { value: "public", label: "Publish publicly", hint: "Anyone on Goatza can find and open it", icon: "mdi:earth" },
    { value: "followers_only", label: "Publish to followers", hint: "Only accounts that follow you see it", icon: "mdi:account-group-outline" },
    { value: "private", label: "Publish privately", hint: "Hidden — only people with the link", icon: "mdi:lock-outline" },
]

// The three headings a good description is built from. Inserted, not
// suggested in a placeholder: they stay in the text.
const DESCRIPTION_HEADINGS = ["What to expect", "What to bring", "How selection works"]

// The stored limit, unchanged. Markdown characters count toward it, which is
// correct: they are characters in the field.
const DESCRIPTION_MAX = 3000

const APPLY_METHODS: { value: ApplyMethod; label: string; icon: string }[] = [
    { value: "goatza", label: "On Goatza", icon: "mdi:cellphone-check" },
    { value: "external", label: "External link", icon: "mdi:open-in-new" },
    { value: "contact", label: "Contact directly", icon: "mdi:phone-outline" },
]

// A fuller description of what each apply method actually does for the player,
// shown under the picker so the org knows exactly what they're choosing.
const APPLY_METHOD_DESC: Record<ApplyMethod, string> = {
    goatza:
        "Players apply right here on Goatza with a quick, pre-filled form. Every application lands in your dashboard, where you review, shortlist, and message applicants — no spreadsheets, no back-and-forth.",
    external:
        "Players tap Apply and are sent to your own website or form to finish applying. Goatza won't receive or track these applications — you'll manage them wherever the link points.",
    contact:
        "There's no in-app form. Players see the contact details you add below and reach out to you directly by phone or email to apply.",
}

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Edit mode: map server detail shapes → wizard draft shapes ──

function reportingTimeToDraft(t: string | null): { value: string; show: boolean } {
    if (!t) return { value: "", show: false }
    // "HH:MM:SS" → "HH:MM"
    const [h = "", m = ""] = t.split(":")
    return { value: `${h}:${m}`, show: true }
}

function mapInitialAgeCategories(r: RecruitmentDetail): AgeGroupDraft[] {
    return (r.age_categories ?? []).map((c, idx) => {
        const rt = reportingTimeToDraft(c.reporting_time)
        return {
            id: uid(),
            // Carried back on save so the backend updates this exact group
            // instead of recreating it — which would drop the group every
            // existing applicant chose.
            serverId: c.id,
            title: c.title,
            min_birth_year: c.min_birth_year,
            max_birth_year: c.max_birth_year,
            reporting_time: rt.value,
            showReportingTime: rt.show,
            display_order: idx,
        }
    })
}

function mapInitialEligibilityCriteria(r: RecruitmentDetail): EligibilityCriteriaDraft[] {
    return (r.eligibility_criteria ?? []).map((c, idx) => ({
        id: uid(),
        title: c.title,
        display_order: idx,
    }))
}

function mapInitialQuestions(r: RecruitmentDetail): QuestionDraft[] {
    return (r.questions ?? []).map((q) => ({
        id: uid(),
        question: q.question,
        // Legacy single-choice "select" is presented as the "Select" (radio)
        // type now — same single-answer behaviour, one option in the picker.
        field_type: q.field_type === "select" ? "radio" : q.field_type,
        is_required: q.is_required,
        options: (q.options ?? []).map((o) => ({ value: o.value })),
    }))
}

function mapInitialBenefits(r: RecruitmentDetail): BenefitDraft[] {
    return (r.benefits ?? []).map((b, idx) => ({
        id: uid(),
        title: b.title,
        icon_name: b.icon_name || "trophy",
        display_order: idx,
    }))
}

function mapInitialRequirements(r: RecruitmentDetail): RequirementDraft[] {
    return (r.requirements ?? []).map((req, idx) => ({
        id: uid(),
        title: req.title,
        is_mandatory: req.is_mandatory,
        display_order: idx,
    }))
}

function mapInitialContacts(r: RecruitmentDetail): ContactDraft[] {
    return (r.contacts ?? []).map((c) => ({
        id: uid(),
        name: c.name,
        contact_type: c.contact_type,
        value: c.value,
    }))
}

function mapInitialPositions(r: RecruitmentDetail): { any: boolean; list: PositionItem[] } {
    if (!r.positions || r.positions.length === 0) return { any: true, list: [] }
    return {
        any: false,
        list: r.positions.map((p) => ({
            position_id: p.position.id,
            name: p.position.name,
        })),
    }
}

function mapInitialLocation(r: RecruitmentDetail): PlaceResult | null {
    if (r.latitude == null || r.longitude == null) return null
    const primary = r.location_name || r.city || "Location"
    return {
        provider: "google",
        label: [r.location_name || r.city, r.country_code].filter(Boolean).join(", "),
        name: primary,
        place_type: "place",
        city: r.city || "",
        state: "",
        country: "",
        country_code: r.country_code,
        latitude: r.latitude,
        longitude: r.longitude,
        external_id: "",
        types: [],
    }
}

function mapInitialMedia(r: RecruitmentDetail): MediaEntry[] {
    return (r.media ?? []).map((m) => ({
        id: uid(),
        file: null,
        originalFile: null,
        preview: m.media_type === "video" ? (m.thumbnail_url || m.file_url) : m.file_url,
        progress: 100,
        status: "done",
        error: null,
        result: {
            file_url: m.file_url,
            public_id: m.public_id,
            media_type: m.media_type,
            thumbnail_url: m.thumbnail_url || undefined,
            order: m.order,
        },
        existing: true,
    }))
}

// ── Step bar ──────────────────────────────────────────────────

function StepBar({ step, labels, onStepClick, disabled }: {
    step: number
    labels: string[]
    onStepClick: (i: number) => void
    disabled: boolean
}) {
    const barRef = useRef<HTMLDivElement>(null)
    const activeRef = useRef<HTMLButtonElement>(null)

    // Keep the active step scrolled to the centre of the (horizontally
    // scrollable) bar as the user advances.
    useEffect(() => {
        const bar = barRef.current
        const active = activeRef.current
        if (!bar || !active) return
        const target = active.offsetLeft + active.offsetWidth / 2 - bar.clientWidth / 2
        bar.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
    }, [step])

    return (
        <div className={styles.stepBar} ref={barRef}>
            {labels.map((label, i) => (
                <button
                    key={i}
                    type="button"
                    ref={i === step ? activeRef : undefined}
                    onClick={() => onStepClick(i)}
                    disabled={disabled}
                    aria-current={i === step ? "step" : undefined}
                    className={`${styles.stepItem} ${styles.stepItemBtn} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}
                >
                    <div className={styles.stepDot}>
                        {i < step ? <Icon icon="mdi:check" width={10} height={10} /> : <span>{i + 1}</span>}
                    </div>
                    <span className={styles.stepLabel}>{label}</span>
                    {i < labels.length - 1 && <div className={styles.stepLine} />}
                </button>
            ))}
        </div>
    )
}

// ── Age Category Builder ──────────────────────────────────────

function AgeCategoryBuilder({ categories, onChange, disabled, allAges, onAllAgesChange }: {
    categories: AgeGroupDraft[]
    onChange: (cats: AgeGroupDraft[]) => void
    disabled: boolean
    allAges: boolean
    onAllAgesChange: (v: boolean) => void
}) {
    // Leaving "specific groups" throws away whatever was authored, so ask
    // first — but only when there is actually something to lose.
    const [confirmClear, setConfirmClear] = useState(false)
    // Fixed for this mount — the presets it produces must not shift under a
    // form that is half filled in.
    const [thisYear] = useState(currentYear)

    const chooseAllAges = () => {
        if (allAges) return
        // Only a row somebody NAMED is worth a confirm. A new recruitment
        // opens with one empty row waiting, and warning about losing that
        // would put a scary dialog in front of the single tap this option is
        // supposed to be.
        if (categories.some(c => c.title.trim())) {
            setConfirmClear(true)
            return
        }
        onChange([])
        onAllAgesChange(true)
    }

    const discardGroups = () => {
        setConfirmClear(false)
        onChange([])
        onAllAgesChange(true)
    }

    const chooseSpecific = () => {
        if (!allAges) return
        onAllAgesChange(false)
    }

    /**
     * A preset chip FILLS the first untitled row before it adds one.
     *
     * A new recruitment opens with one empty row waiting (see the state it
     * initialises to), and appending past it would leave a blank group the
     * org then has to notice and delete. Filling it is what makes the common
     * case — one age group — a single tap. A row the org has named is never
     * touched.
     */
    const addPreset = (label: string, maxAge: number) => {
        if (categories.find(c => c.title === label)) return
        const years = ageToYears(maxAge, thisYear)
        const waiting = categories.findIndex(c => !c.title.trim())
        if (waiting !== -1) {
            onChange(categories.map((c, i) => (
                i === waiting ? { ...c, title: label, ...years } : c
            )))
            return
        }
        onChange([...categories, {
            ...newAgeGroup(thisYear, categories.length),
            title: label,
            ...years,
        }])
    }

    const addCustom = () => {
        onChange([...categories, newAgeGroup(thisYear, categories.length)])
    }

    const update = (id: string, patch: Partial<AgeGroupDraft>) => {
        onChange(categories.map(c => c.id === id ? { ...c, ...patch } : c))
    }

    // An emptied year input is a real value here ("no bound"), not a typo —
    // that is what makes a group open-ended.
    const updateYear = (id: string, key: "min_birth_year" | "max_birth_year", raw: string) => {
        update(id, { [key]: raw === "" ? null : Number(raw) } as Partial<AgeGroupDraft>)
    }

    const remove = (id: string) => onChange(categories.filter(c => c.id !== id))

    const activePresets = new Set(categories.map(c => c.title))

    return (
        <div className={styles.ageCategoryBuilder}>
            {/* Age policy — all ages vs specific groups */}
            <div className={styles.agePolicyRow} role="radiogroup" aria-label="Age policy">
                <button
                    type="button"
                    role="radio"
                    aria-checked={allAges}
                    className={`${styles.noAgeToggle} ${allAges ? styles.noAgeToggleActive : ""}`}
                    onClick={chooseAllAges}
                    disabled={disabled}
                >
                    <Icon icon={allAges ? "mdi:radiobox-marked" : "mdi:radiobox-blank"} width={14} height={14} />
                    Open to all ages
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={!allAges}
                    className={`${styles.noAgeToggle} ${!allAges ? styles.noAgeToggleActive : ""}`}
                    onClick={chooseSpecific}
                    disabled={disabled}
                >
                    <Icon icon={!allAges ? "mdi:radiobox-marked" : "mdi:radiobox-blank"} width={14} height={14} />
                    Specific age groups
                </button>
            </div>

            {allAges ? (
                <p className={styles.emptyHint}>
                    <Icon icon="mdi:information-outline" width={13} height={13} />
                    Open to all ages — the listing will show &ldquo;All ages&rdquo;.
                </p>
            ) : (
              <>
            {/* Preset chips */}
            <div className={styles.agePresetRow}>
                {AGE_PRESETS.map(p => (
                    <button
                        key={p.label}
                        type="button"
                        className={`${styles.agePresetChip} ${activePresets.has(p.label) ? styles.agePresetChipActive : ""}`}
                        onClick={() => addPreset(p.label, p.maxAge)}
                        disabled={disabled || activePresets.has(p.label)}
                    >
                        {activePresets.has(p.label) && <Icon icon="mdi:check" width={11} height={11} />}
                        {p.label}
                    </button>
                ))}
                <button
                    type="button"
                    className={styles.agePresetChipCustom}
                    onClick={addCustom}
                    disabled={disabled}
                >
                    <Icon icon="mdi:plus" width={13} height={13} />
                    Custom
                </button>
            </div>

            {/* Category cards */}
            {categories.length > 0 && (
                <div className={styles.ageCategoryList}>
                    {categories.map((cat) => (
                        <div key={cat.id} className={styles.ageCategoryCard}>
                            <div className={styles.ageCategoryCardHeader}>
                                <input
                                    className={`${styles.fieldInput} ${styles.ageTitleInput}`}
                                    placeholder="Category title, e.g. U17"
                                    value={cat.title}
                                    onChange={e => update(cat.id, { title: e.target.value })}
                                    disabled={disabled}
                                    maxLength={30}
                                />
                                <button
                                    className={styles.removeQBtn}
                                    onClick={() => remove(cat.id)}
                                    type="button"
                                    disabled={disabled}
                                >
                                    <Icon icon="mdi:close" width={14} height={14} />
                                </button>
                            </div>

                            <div className={styles.fieldRow}>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>
                                        Min Birth Year <span className={styles.optionalTag}>Optional</span>
                                    </label>
                                    <input
                                        className={styles.fieldInput}
                                        type="number"
                                        min={MIN_BIRTH_YEAR}
                                        max={thisYear}
                                        placeholder="Any"
                                        value={cat.min_birth_year ?? ""}
                                        onChange={e => updateYear(cat.id, "min_birth_year", e.target.value)}
                                        disabled={disabled}
                                    />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>
                                        Max Birth Year <span className={styles.optionalTag}>Optional</span>
                                    </label>
                                    <input
                                        className={styles.fieldInput}
                                        type="number"
                                        min={MIN_BIRTH_YEAR}
                                        max={thisYear}
                                        placeholder="Any"
                                        value={cat.max_birth_year ?? ""}
                                        onChange={e => updateYear(cat.id, "max_birth_year", e.target.value)}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>

                            {/* Live read-back of what the two years actually say,
                                so open-ended groups are obvious while typing. */}
                            <p className={styles.ageRangePreview}>
                                <Icon icon="mdi:cake-variant-outline" width={13} height={13} />
                                {formatBirthYears(cat.min_birth_year, cat.max_birth_year)
                                    || "Set at least one year — leave max empty for “or later”, min empty for “or earlier”."}
                            </p>

                            {/* Reporting time — optional toggle */}
                            <div className={styles.reportingTimeRow}>
                                <button
                                    type="button"
                                    className={`${styles.reportingTimeToggle} ${cat.showReportingTime ? styles.reportingTimeToggleActive : ""}`}
                                    onClick={() => update(cat.id, { showReportingTime: !cat.showReportingTime, reporting_time: "" })}
                                    disabled={disabled}
                                >
                                    <Icon icon={cat.showReportingTime ? "mdi:clock-check-outline" : "mdi:clock-plus-outline"} width={13} height={13} />
                                    {cat.showReportingTime ? "Remove reporting time" : "Add reporting time"}
                                </button>
                                {cat.showReportingTime && (
                                    <input
                                        className={`${styles.fieldInput} ${styles.reportingTimeInput}`}
                                        type="time"
                                        value={cat.reporting_time}
                                        onChange={e => update(cat.id, { reporting_time: e.target.value })}
                                        disabled={disabled}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {categories.length === 0 && (
                <p className={styles.emptyHint}>
                    <Icon icon="mdi:information-outline" width={13} height={13} />
                    Select preset age groups above or add a custom group.
                </p>
            )}
              </>
            )}

            {confirmClear && (
                <div className={styles.confirmOverlay} onClick={() => setConfirmClear(false)}>
                    <div
                        className={styles.confirmDialog}
                        onClick={e => e.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Discard age groups"
                    >
                        <span className={styles.confirmIcon}>
                            <Icon icon="mdi:alert-outline" width={26} height={26} />
                        </span>
                        <h3 className={styles.confirmTitle}>Discard the age groups?</h3>
                        <p className={styles.confirmText}>
                            Switching to &ldquo;Open to all ages&rdquo; removes the{" "}
                            {categories.length} group{categories.length > 1 ? "s" : ""} you&rsquo;ve set up.
                        </p>
                        <div className={styles.confirmActions}>
                            <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmClear(false)}>
                                Keep groups
                            </button>
                            <button type="button" className={styles.confirmDiscardBtn} onClick={discardGroups}>
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Eligibility criteria builder ──────────────────────────────

// Free-text lines about who may attend. Mirrors RequirementsBuilder (the org
// is writing a list either way) minus the mandatory toggle — a criterion is
// never "optional", and none of it is ever checked against an applicant.
// The experience levels the wizard used to offer as a dropdown live here now:
// nothing matched or filtered on the field, and a line of text says the same
// thing in the recruiter's own words. (Existing records keep their stored
// `experience_level` — the column and the server's filter param both remain —
// but nothing in the UI writes, filters on, or renders it any more.)
//
// QUICK-FILL ONLY, and deliberately LOCATION-NEUTRAL: these chips are shown to
// every org in the product, so none of them may name a state, a country, a
// region or a governing body. That is not a vocabulary — the field is free
// text and an org that means "Kerala residents only", or any other specific
// place, types it. A preset would put one state's wording in front of every
// org that has nothing to do with it.
const CRITERIA_PRESETS = [
    "Beginners welcome",
    "Some competitive experience required",
    "Club or academy experience required",
    "School / college students only",
    "Local residents only",
    "Open to players from any region",
]

function EligibilityCriteriaBuilder({ criteria, onChange, disabled }: {
    criteria: EligibilityCriteriaDraft[]
    onChange: (c: EligibilityCriteriaDraft[]) => void
    disabled: boolean
}) {
    const add = (title = "") =>
        onChange([...criteria, { id: uid(), title, display_order: criteria.length }])
    const update = (id: string, patch: Partial<EligibilityCriteriaDraft>) =>
        onChange(criteria.map(c => c.id === id ? { ...c, ...patch } : c))
    const remove = (id: string) => onChange(criteria.filter(c => c.id !== id))

    // Reorder by one slot — same list, swapped neighbours.
    const move = (index: number, delta: number) => {
        const target = index + delta
        if (target < 0 || target >= criteria.length) return
        const next = [...criteria]
        const [row] = next.splice(index, 1)
        next.splice(target, 0, row)
        onChange(next.map((c, idx) => ({ ...c, display_order: idx })))
    }

    const activeSet = new Set(criteria.map(c => c.title))

    return (
        <div className={styles.requirementsBuilder}>
            <div className={styles.reqPresetRow}>
                {CRITERIA_PRESETS.map(p => (
                    <button
                        key={p}
                        type="button"
                        className={`${styles.reqPresetChip} ${activeSet.has(p) ? styles.reqPresetChipActive : ""}`}
                        onClick={() => !activeSet.has(p) && add(p)}
                        disabled={disabled || activeSet.has(p)}
                    >
                        {activeSet.has(p) && <Icon icon="mdi:check" width={10} height={10} />}
                        {p}
                    </button>
                ))}
            </div>
            {criteria.map((c, i) => (
                <div key={c.id} className={styles.listBuilderRow}>
                    <div className={styles.criteriaReorder}>
                        <button
                            type="button"
                            className={styles.criteriaReorderBtn}
                            onClick={() => move(i, -1)}
                            disabled={disabled || i === 0}
                            aria-label="Move up"
                        >
                            <Icon icon="mdi:chevron-up" width={14} height={14} />
                        </button>
                        <button
                            type="button"
                            className={styles.criteriaReorderBtn}
                            onClick={() => move(i, 1)}
                            disabled={disabled || i === criteria.length - 1}
                            aria-label="Move down"
                        >
                            <Icon icon="mdi:chevron-down" width={14} height={14} />
                        </button>
                    </div>
                    <input
                        className={`${styles.fieldInput} ${styles.listBuilderInput}`}
                        placeholder="e.g. Players from our district only"
                        value={c.title}
                        onChange={e => update(c.id, { title: e.target.value })}
                        disabled={disabled}
                        maxLength={120}
                    />
                    <button className={styles.removeQBtn} onClick={() => remove(c.id)} type="button" disabled={disabled}>
                        <Icon icon="mdi:close" width={13} height={13} />
                    </button>
                </div>
            ))}
            <button className={styles.addQBtn} onClick={() => add()} type="button" disabled={disabled}>
                <Icon icon="mdi:plus-circle-outline" width={15} height={15} />
                Add Criteria
            </button>
        </div>
    )
}

// ── Benefits builder ──────────────────────────────────────────

function BenefitsBuilder({ benefits, onChange, disabled }: {
    benefits: BenefitDraft[]
    onChange: (b: BenefitDraft[]) => void
    disabled: boolean
}) {
    const add = () => onChange([...benefits, { id: uid(), title: "", icon_name: "trophy", display_order: benefits.length }])
    const update = (id: string, patch: Partial<BenefitDraft>) => onChange(benefits.map(b => b.id === id ? { ...b, ...patch } : b))
    const remove = (id: string) => onChange(benefits.filter(b => b.id !== id))

    // Which benefit's icon picker is expanded (only one at a time).
    const [openPickerId, setOpenPickerId] = useState<string | null>(null)
    const builderRef = useRef<HTMLDivElement>(null)

    // Close the open picker when clicking outside the builder.
    useEffect(() => {
        if (!openPickerId) return
        const onDown = (e: MouseEvent) => {
            if (builderRef.current && !builderRef.current.contains(e.target as Node)) {
                setOpenPickerId(null)
            }
        }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [openPickerId])

    return (
        <div className={styles.listBuilder} ref={builderRef}>
            {benefits.map((b) => {
                const iconEntry = BENEFIT_ICONS.find(ic => ic.value === b.icon_name) ?? BENEFIT_ICONS[0]
                const pickerOpen = openPickerId === b.id
                return (
                    <div key={b.id} className={styles.benefitItem}>
                        <div className={styles.listBuilderRow}>
                            <div className={styles.benefitIconWrap}>
                                <button
                                    type="button"
                                    className={`${styles.benefitIconTrigger} ${pickerOpen ? styles.benefitIconTriggerActive : ""}`}
                                    onClick={() => setOpenPickerId(pickerOpen ? null : b.id)}
                                    disabled={disabled}
                                    title={`Icon: ${iconEntry.label}`}
                                    aria-label={`Choose benefit icon — current: ${iconEntry.label}`}
                                    aria-expanded={pickerOpen}
                                >
                                    <Icon icon={iconEntry.icon} width={18} height={18} />
                                    <Icon icon="mdi:chevron-down" width={12} height={12} className={styles.benefitIconChevron} />
                                </button>

                                {pickerOpen && (
                                    <div className={styles.benefitIconMenu} role="listbox" aria-label="Benefit icons">
                                        {BENEFIT_ICONS.map(ic => (
                                            <button
                                                key={ic.value}
                                                type="button"
                                                role="option"
                                                aria-selected={ic.value === b.icon_name}
                                                className={`${styles.benefitIconOption} ${ic.value === b.icon_name ? styles.benefitIconOptionActive : ""}`}
                                                onClick={() => { update(b.id, { icon_name: ic.value }); setOpenPickerId(null) }}
                                                title={ic.label}
                                            >
                                                <Icon icon={ic.icon} width={18} height={18} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input
                                className={`${styles.fieldInput} ${styles.listBuilderInput}`}
                                placeholder="e.g. Professional Coaching"
                                value={b.title}
                                onChange={e => update(b.id, { title: e.target.value })}
                                disabled={disabled}
                                maxLength={80}
                            />
                            <button className={styles.removeQBtn} onClick={() => { remove(b.id); setOpenPickerId(null) }} type="button" disabled={disabled}>
                                <Icon icon="mdi:close" width={13} height={13} />
                            </button>
                        </div>
                    </div>
                )
            })}
            <button className={styles.addQBtn} onClick={add} type="button" disabled={disabled}>
                <Icon icon="mdi:plus-circle-outline" width={15} height={15} />
                Add Benefit
            </button>
        </div>
    )
}

// ── Requirements builder ──────────────────────────────────────

const REQUIREMENT_PRESETS = [
    "Aadhaar Card",
    "Birth Certificate",
    "Football Kit & Boots",
    "School ID / TC",
    "Medical Fitness Certificate",
    "Previous Tournament Certificates",
    "Passport Photo",
]

function RequirementsBuilder({ requirements, onChange, disabled }: {
    requirements: RequirementDraft[]
    onChange: (r: RequirementDraft[]) => void
    disabled: boolean
}) {
    const add = (title = "") => onChange([...requirements, { id: uid(), title, is_mandatory: true, display_order: requirements.length }])
    const update = (id: string, patch: Partial<RequirementDraft>) => onChange(requirements.map(r => r.id === id ? { ...r, ...patch } : r))
    const remove = (id: string) => onChange(requirements.filter(r => r.id !== id))
    const activeSet = new Set(requirements.map(r => r.title))

    return (
        <div className={styles.requirementsBuilder}>
            {/* Preset chips */}
            <div className={styles.reqPresetRow}>
                {REQUIREMENT_PRESETS.map(p => (
                    <button
                        key={p}
                        type="button"
                        className={`${styles.reqPresetChip} ${activeSet.has(p) ? styles.reqPresetChipActive : ""}`}
                        onClick={() => !activeSet.has(p) && add(p)}
                        disabled={disabled || activeSet.has(p)}
                    >
                        {activeSet.has(p) && <Icon icon="mdi:check" width={10} height={10} />}
                        {p}
                    </button>
                ))}
            </div>
            {requirements.map(r => (
                <div key={r.id} className={styles.listBuilderRow}>
                    <button
                        type="button"
                        className={`${styles.mandatoryToggle} ${r.is_mandatory ? styles.mandatoryToggleOn : ""}`}
                        onClick={() => update(r.id, { is_mandatory: !r.is_mandatory })}
                        title={r.is_mandatory ? "Mandatory" : "Optional"}
                        disabled={disabled}
                    >
                        <Icon icon={r.is_mandatory ? "mdi:asterisk" : "mdi:asterisk-circle-outline"} width={13} height={13} />
                    </button>
                    <input
                        className={`${styles.fieldInput} ${styles.listBuilderInput}`}
                        placeholder="Requirement"
                        value={r.title}
                        onChange={e => update(r.id, { title: e.target.value })}
                        disabled={disabled}
                        maxLength={80}
                    />
                    <button className={styles.removeQBtn} onClick={() => remove(r.id)} type="button" disabled={disabled}>
                        <Icon icon="mdi:close" width={13} height={13} />
                    </button>
                </div>
            ))}
            <button className={styles.addQBtn} onClick={() => add()} type="button" disabled={disabled}>
                <Icon icon="mdi:plus-circle-outline" width={15} height={15} />
                Add item
            </button>
        </div>
    )
}

// ── Choice chips ──────────────────────────────────────────────
// A radio group drawn as chips: three or four options, one tap, no popup.
// (A Select for three values is a tap to open, a scroll and a tap to pick.)
function ChoiceChips({ options, value, onChange, disabled, ariaLabel }: {
    options: { value: string; label: string; icon?: string }[]
    value: string
    onChange: (v: string) => void
    disabled?: boolean
    ariaLabel: string
}) {
    return (
        <div className={styles.chipRow} role="radiogroup" aria-label={ariaLabel}>
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`${styles.choiceChip} ${value === o.value ? styles.choiceChipActive : ""}`}
                    onClick={() => onChange(o.value)}
                    disabled={disabled}
                >
                    {o.icon && <Icon icon={o.icon} width={14} height={14} />}
                    {o.label}
                </button>
            ))}
        </div>
    )
}

// ── Date presets ──────────────────────────────────────────────
// "YYYY-MM-DD" of a local Date.
function toDatePart(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The next `weekday` (0 = Sunday) strictly after today, plus `weeksAhead`
// whole weeks: "This Saturday" is the coming one, "Next Sunday" the one after
// the coming Sunday.
function upcomingWeekday(weekday: number, weeksAhead = 0, from = new Date()): string {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    let delta = (weekday - d.getDay() + 7) % 7
    if (delta === 0) delta = 7
    d.setDate(d.getDate() + delta + weeksAhead * 7)
    return toDatePart(d)
}

// `days` before a wizard date value's DATE part, as a date-only value.
function daysBefore(value: string, days: number): string {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number)
    if (!y || !m || !d) return ""
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() - days)
    return toDatePart(date)
}

const DEADLINE_PRESETS = [
    { label: "1 day before", days: 1 },
    { label: "3 days before", days: 3 },
    { label: "1 week before", days: 7 },
]

/**
 * What a deadline DATE means when no time is picked with it.
 *
 * Midday, not midnight and not end-of-day. A recruiter saying “closes on the
 * 10th” means that morning's post, and a date-only value resolves to 23:59
 * (wizardDate.ts) — so the listing kept taking applications all through the
 * last evening, hours after the club had stopped reading them.
 *
 * It is a DEFAULT, not a floor: the time select beside the date still offers
 * every half-hour, and “Time —” still clears it back to the whole day. Only
 * the TRIAL date is left alone — a trial has a real kick-off time the
 * recruiter knows, and guessing noon for it would be a wrong fact rather than
 * a sensible default.
 */
const DEADLINE_DEFAULT_TIME = "12:00"

/**
 * What to do when the ground is not in Google — said once, under both place
 * pickers (the trial's own and each centre's).
 *
 * Plenty of grounds are not mapped, and an org that cannot find theirs tends
 * to leave the picker empty, which costs the listing every nearby search it
 * would have appeared in. The pin is only ever used for DISTANCE; the venue
 * name under it is what a player actually reads and travels to.
 */
const LOCATION_PICKER_HINT =
    "Can't find your ground? Pick the nearest landmark or town — " +
    "players read the venue name, the pin is for distance."

// ── The trial's shape ─────────────────────────────────────────
// Asked FIRST on the when & where step, because it decides what a date row
// even asks for. Nothing signalled before this that a trial could be a city
// tour or two zones on one Saturday, so nobody posted one — the formats
// existed in the data model and not in the UI. See sessions.ts for what each
// one means.
const TRIAL_SHAPES: {
    value: TrialShape
    label: string
    blurb: string
    icon: string
}[] = [
    {
        value: "single",
        label: "One day",
        blurb: "One date at one ground.",
        icon: "mdi:calendar-today",
    },
    {
        value: "multi_day",
        label: "Several days, same ground",
        blurb: "Screening rounds, or a day per district.",
        icon: "mdi:calendar-multiple",
    },
    {
        value: "multi_place",
        label: "Several places",
        blurb: "A different city or ground for each date.",
        icon: "mdi:map-marker-multiple",
    },
]

// ── Contacts builder ──────────────────────────────────────────

type ContactSuggestion = { name: string; contact_type: "phone" | "email"; value: string }

function ContactsBuilder({ contacts, onChange, disabled, suggestions = [] }: {
    contacts: ContactDraft[]
    onChange: (c: ContactDraft[]) => void
    disabled: boolean
    /** Contacts already on file (the admin's account) — one tap to add. */
    suggestions?: ContactSuggestion[]
}) {
    const add = (type: "phone" | "email") => onChange([...contacts, { id: uid(), name: "", contact_type: type, value: "" }])
    const addSuggestion = (sug: ContactSuggestion) =>
        onChange([...contacts, { id: uid(), name: sug.name, contact_type: sug.contact_type, value: sug.value }])
    const present = new Set(contacts.map(c => c.value.trim()))
    const offered = suggestions.filter(sg => !present.has(sg.value.trim()))
    const update = (id: string, patch: Partial<ContactDraft>) => onChange(contacts.map(c => c.id === id ? { ...c, ...patch } : c))
    const remove = (id: string) => onChange(contacts.filter(c => c.id !== id))

    return (
        <div className={styles.listBuilder}>
            {offered.length > 0 && (
                <div className={styles.chipRow} aria-label="Saved contacts">
                    {offered.map(sg => (
                        <button
                            key={`${sg.contact_type}:${sg.value}`}
                            type="button"
                            className={styles.insertChip}
                            onClick={() => addSuggestion(sg)}
                            disabled={disabled}
                            title="Add this saved contact"
                        >
                            <Icon icon={sg.contact_type === "phone" ? "mdi:phone-plus-outline" : "mdi:email-plus-outline"} width={13} height={13} />
                            {sg.value}
                        </button>
                    ))}
                </div>
            )}
            {contacts.map(c => (
                <div key={c.id} className={styles.contactRow}>
                    <Select
                        className={styles.contactTypeSelect}
                        size="sm"
                        searchable={false}
                        aria-label="Contact type"
                        sheetTitle="Contact type"
                        value={c.contact_type}
                        onChange={v => update(c.id, { contact_type: v as "phone" | "email" })}
                        disabled={disabled}
                        options={[
                            { value: "phone", label: "Phone" },
                            { value: "email", label: "Email" },
                        ]}
                    />
                    <input
                        className={`${styles.fieldInput} ${styles.contactNameInput}`}
                        placeholder="Name (optional)"
                        value={c.name}
                        onChange={e => update(c.id, { name: e.target.value })}
                        disabled={disabled}
                        maxLength={60}
                    />
                    <input
                        className={`${styles.fieldInput} ${styles.contactValueInput}`}
                        placeholder={c.contact_type === "phone" ? "+91 XXXXX XXXXX" : "email@example.com"}
                        value={c.value}
                        onChange={e => update(c.id, { value: e.target.value })}
                        disabled={disabled}
                        type={c.contact_type === "email" ? "email" : "tel"}
                    />
                    <button className={styles.removeQBtn} onClick={() => remove(c.id)} type="button" disabled={disabled}>
                        <Icon icon="mdi:close" width={13} height={13} />
                    </button>
                </div>
            ))}
            <div className={styles.contactAddRow}>
                <button className={styles.contactAddBtn} onClick={() => add("phone")} type="button" disabled={disabled}>
                    <Icon icon="mdi:phone-plus-outline" width={14} height={14} />
                    Phone
                </button>
                <button className={styles.contactAddBtn} onClick={() => add("email")} type="button" disabled={disabled}>
                    <Icon icon="mdi:email-plus-outline" width={14} height={14} />
                    Email
                </button>
            </div>
        </div>
    )
}

// ── Question builder ──────────────────────────────────────────

function QuestionBuilder({ questions, onChange, disabled }: {
    questions: QuestionDraft[]
    onChange: (qs: QuestionDraft[]) => void
    disabled: boolean
}) {
    const addQuestion = () => onChange([...questions, { id: uid(), question: "", field_type: "short_text", is_required: false, options: [] }])
    const updateQ = (id: string, patch: Partial<QuestionDraft>) => onChange(questions.map(q => q.id === id ? { ...q, ...patch } : q))
    const removeQ = (id: string) => onChange(questions.filter(q => q.id !== id))
    const addOption = (id: string) => onChange(questions.map(q => q.id === id ? { ...q, options: [...q.options, { value: "" }] } : q))
    const updateOption = (qid: string, oi: number, val: string) => onChange(questions.map(q => q.id === qid ? { ...q, options: q.options.map((o, i) => i === oi ? { value: val } : o) } : q))
    const removeOption = (qid: string, oi: number) => onChange(questions.map(q => q.id === qid ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q))
    // Answer types are labelled by HOW the player answers, not by the HTML
    // control. "Select" (single choice) maps to radio; "Multi-select" maps to
    // checkbox. The old raw dropdown ("select") is dropped — legacy questions
    // are normalised to radio on load (see mapInitialQuestions).
    const FIELD_TYPES: { value: QuestionFieldType; label: string; hint: string }[] = [
        { value: "short_text", label: "Short answer", hint: "Player types a short, single-line answer." },
        { value: "long_text", label: "Paragraph", hint: "Player writes a longer, multi-line answer." },
        { value: "number", label: "Number", hint: "Player enters a number." },
        { value: "radio", label: "Select — one choice", hint: "Player picks exactly one of the options you add below." },
        { value: "checkbox", label: "Multi-select — many choices", hint: "Player can pick one or more of the options you add below." },
    ]
    // "select" stays in here for the legacy value only — it is never offered
    // above, but a stored question that still carries it has options to show.
    const HAS_OPTIONS: QuestionFieldType[] = ["radio", "select", "checkbox"]
    const typeHint = (t: QuestionFieldType) => FIELD_TYPES.find(ft => ft.value === t)?.hint ?? ""

    return (
        <div className={styles.questionBuilder}>
            {questions.map((q, i) => (
                <div key={q.id} className={styles.questionCard}>
                    <div className={styles.questionCardHeader}>
                        <span className={styles.questionNum}>Q{i + 1}</span>
                        <Select
                            className={styles.qTypeField}
                            size="sm"
                            searchable={false}
                            aria-label="How players answer this question"
                            sheetTitle="Answer type"
                            value={q.field_type}
                            onChange={v => updateQ(q.id, { field_type: v as QuestionFieldType })}
                            disabled={disabled}
                            options={FIELD_TYPES.map(ft => ({ value: ft.value, label: ft.label }))}
                        />
                        <label className={styles.requiredToggle} title="Players can't submit their application without answering this question.">
                            <input type="checkbox" checked={q.is_required} onChange={e => updateQ(q.id, { is_required: e.target.checked })} disabled={disabled} />
                            <span>Required to apply</span>
                        </label>
                        {!disabled && <button className={styles.removeQBtn} onClick={() => removeQ(q.id)} type="button"><Icon icon="mdi:close" width={14} height={14} /></button>}
                    </div>
                    <input className={styles.qInput} placeholder="Question text…" value={q.question} onChange={e => updateQ(q.id, { question: e.target.value })} disabled={disabled} />
                    <p className={styles.qTypeHint}>
                        <Icon icon="mdi:information-outline" width={12} height={12} />
                        {typeHint(q.field_type)}
                    </p>
                    {HAS_OPTIONS.includes(q.field_type) && (
                        <div className={styles.optionsList}>
                            {q.options.map((o, oi) => (
                                <div key={oi} className={styles.optionRow}>
                                    <input className={styles.optionInput} placeholder={`Option ${oi + 1}`} value={o.value} onChange={e => updateOption(q.id, oi, e.target.value)} disabled={disabled} />
                                    {!disabled && <button className={styles.removeOptBtn} onClick={() => removeOption(q.id, oi)} type="button"><Icon icon="mdi:close" width={11} height={11} /></button>}
                                </div>
                            ))}
                            {!disabled && <button className={styles.addOptionBtn} onClick={() => addOption(q.id)} type="button"><Icon icon="mdi:plus" width={13} height={13} />Add Option</button>}
                        </div>
                    )}
                </div>
            ))}
            {!disabled && (
                <button className={styles.addQBtn} onClick={addQuestion} type="button">
                    <Icon icon="mdi:plus-circle-outline" width={16} height={16} />
                    Add Question
                </button>
            )}
        </div>
    )
}

// ── Media preview carousel ────────────────────────────────────

function MediaPreview({ entries, onRemove, onCropEntry, disabled }: {
    entries: MediaEntry[]
    onRemove: (id: string) => void
    onCropEntry: (id: string, file: File, crop: CropState, zoom: number) => void
    disabled: boolean
}) {
    // Clamped during render, not corrected afterwards in an effect.
    // `entries` shrinks when the author removes an item, and an index past the
    // end reads `undefined`. Doing it here means the broken frame is never
    // painted; the effect that used to fix it rendered it once first.
    const [rawIdx, setIdx] = useState(0)
    const idx = entries.length > 0 ? Math.min(rawIdx, entries.length - 1) : 0
    // Crop editor — cropSrc is a temp object URL of the ORIGINAL image.
    const [cropId, setCropId] = useState<string | null>(null)
    const [cropSrc, setCropSrc] = useState<string | null>(null)
    const aspect = MEDIA_ASPECT

    if (entries.length === 0) return null
    const total = entries.length
    const cur = entries[idx]

    // Only freshly-added local images can be re-cropped (existing/remote media
    // has no source file and can't be re-fetched cross-origin).
    const canAdjust = (e: MediaEntry) => !disabled && !e.existing && !!e.originalFile && e.status === "idle"

    const cropEntry = cropId ? entries.find(e => e.id === cropId) ?? null : null

    const openCropper = (entry: MediaEntry) => {
        if (!entry.originalFile) return
        setCropSrc(URL.createObjectURL(entry.originalFile))
        setCropId(entry.id)
    }
    const closeCropper = () => {
        if (cropSrc) URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
        setCropId(null)
    }
    const applyCrop = (blob: Blob, crop: CropState, zoom: number) => {
        if (cropEntry?.originalFile) {
            const base = cropEntry.originalFile.name.replace(/\.[^.]+$/, "") || "photo"
            const file = new File([blob], `${base}.jpg`, { type: "image/jpeg" })
            onCropEntry(cropEntry.id, file, crop, zoom)
        }
        closeCropper()
    }

    return (
        <>
        <div className={styles.previewCarousel}>
            <div className={styles.previewSlide} style={{ aspectRatio: String(aspect) }}>
                <img src={cur.preview} className={styles.previewMedia} alt={`Media ${idx + 1}`} />
                {cur.status === "uploading" && <div className={styles.previewOverlay}><span className={styles.uploadPct}>{cur.progress}%</span></div>}
                {cur.status === "done" && <div className={styles.previewOverlay}><Icon icon="mdi:check-circle" width={28} height={28} style={{ color: "var(--color-brand)" }} /></div>}
                {cur.status === "error" && <div className={styles.previewOverlayErr}><Icon icon="mdi:alert-circle" width={20} height={20} /><span>{cur.error}</span></div>}
                {!disabled && <button className={styles.previewRemoveBtn} onClick={() => { onRemove(cur.id); if (idx > 0 && idx === total - 1) setIdx(idx - 1) }} type="button"><Icon icon="mdi:close" width={13} height={13} /></button>}
                {canAdjust(cur) && (
                    <button className={styles.previewCropBtn} onClick={() => openCropper(cur)} type="button" aria-label="Adjust photo">
                        <Icon icon="mdi:crop" width={13} height={13} /> Adjust
                    </button>
                )}
                {total > 1 && <div className={styles.previewCounter}>{idx + 1}/{total}</div>}
                {total > 1 && idx > 0 && <button className={`${styles.previewNav} ${styles.previewNavPrev}`} onClick={() => setIdx(i => Math.max(0, i - 1))} type="button"><Icon icon="mdi:chevron-left" width={18} height={18} /></button>}
                {total > 1 && idx < total - 1 && <button className={`${styles.previewNav} ${styles.previewNavNext}`} onClick={() => setIdx(i => Math.min(total - 1, i + 1))} type="button"><Icon icon="mdi:chevron-right" width={18} height={18} /></button>}
            </div>
            {total > 1 && (
                <div className={styles.previewThumbRow}>
                    {entries.map((e, i) => (
                        <button key={e.id} className={`${styles.previewThumb} ${i === idx ? styles.previewThumbActive : ""}`} onClick={() => setIdx(i)} type="button">
                            <img src={e.preview} className={styles.previewThumbImg} alt="" />
                            {e.status === "done" && <span className={styles.thumbDone}><Icon icon="mdi:check" width={9} height={9} /></span>}
                        </button>
                    ))}
                </div>
            )}
        </div>

        {cropId && cropSrc && (
            <PostImageCropper
                src={cropSrc}
                aspect={aspect}
                initialCrop={cropEntry?.crop}
                initialZoom={cropEntry?.zoom}
                onCancel={closeCropper}
                onApply={applyCrop}
            />
        )}
        </>
    )
}

// ── Date + time field ─────────────────────────────────────────
// Renders a separate date input and a 30-minute-step time picker, but reads /
// writes a single wizard value: "YYYY-MM-DD" (no time) or "YYYY-MM-DDTHH:MM".
// Time is optional — the date alone is enough.

function DateTimeField({ value, onChange, disabled, dateRef, onBlur, invalid, defaultTime }: {
    value: string
    onChange: (v: string) => void
    disabled?: boolean
    dateRef?: React.RefObject<HTMLInputElement | null>
    onBlur?: () => void
    invalid?: boolean
    /**
     * The time a freshly-picked DATE gets when none has been chosen yet.
     * Left off, a date alone stays a date alone — which is what the trial
     * date wants. Never applied to a date that already carries a time, so
     * it cannot overwrite a choice the user made.
     */
    defaultTime?: string
}) {
    const datePart = value ? value.slice(0, 10) : ""
    const timePart = value.includes("T") ? value.slice(11, 16) : ""

    // An already-saved time that isn't on the 30-minute grid (e.g. a legacy
    // 09:15) gets its own option so editing doesn't silently blank it.
    const timeOptions = timePart && !TIME_OPTIONS.some(o => o.value === timePart)
        ? [{ value: timePart, label: fmtTimeLabel(timePart) }, ...TIME_OPTIONS]
        : TIME_OPTIONS

    const setDate = (d: string) => {
        if (!d) { onChange(""); return }
        const t = timePart || defaultTime || ""
        onChange(t ? `${d}T${t}` : d)
    }
    const setTime = (t: string) => {
        if (!datePart) return
        onChange(t ? `${datePart}T${t}` : datePart)
    }

    return (
        <div className={styles.dateTimeRow}>
            <input
                ref={dateRef}
                className={`${styles.fieldInput} ${styles.dateTimeDate} ${invalid ? styles.fieldInputInvalid : ""}`}
                type="date"
                value={datePart}
                onChange={e => setDate(e.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={invalid || undefined}
            />
            {/* "" is an answer here, not a placeholder: a date with no time is
                valid, and picking "Time —" again is how a time is cleared. */}
            <Select
                className={styles.dateTimeTime}
                size="sm"
                value={timePart}
                onChange={setTime}
                disabled={disabled || !datePart}
                aria-label={datePart ? "Time (optional)" : "Pick a date first"}
                sheetTitle="Time"
                options={[
                    { value: "", label: "Time —" },
                    ...timeOptions.map(o => ({ value: o.value, label: o.label })),
                ]}
            />
        </div>
    )
}

// ── Back gesture ──────────────────────────────────────────────
// useBackToClose reserves ONE history entry and consumes it on popstate, then
// calls back. The wizard wants a back press to move one step, not to leave —
// so the hook lives in this null component, and the modal remounts it (by
// `key`) after every consumed press to reserve a fresh entry.
function BackGuard({ onBack, controlRef }: {
    onBack: () => void
    controlRef: React.RefObject<BackToClose | null>
}) {
    const back = useBackToClose(onBack)
    useEffect(() => {
        controlRef.current = back
        return () => { controlRef.current = null }
    }, [back, controlRef])
    return null
}

// ── Main Modal ────────────────────────────────────────────────

interface CreateRecruitmentModalProps {
    username: string
    userAvatarUrl?: string
    userInitials?: string
    displayName?: string
    orgId: string
    onClose: () => void
    onCreated?: (recruitmentId: string) => void
    /** "edit" prefills the wizard from initialRecruitment and PATCHes on save. */
    mode?: "create" | "edit"
    initialRecruitment?: RecruitmentDetail
    onUpdated?: (recruitmentId: string, scheduleChangedFields: string[]) => void
}

export default function CreateRecruitmentModal({
    username,
    userAvatarUrl,
    userInitials,
    displayName,
    orgId,
    onClose,
    onCreated,
    mode = "create",
    initialRecruitment,
    onUpdated,
}: CreateRecruitmentModalProps) {
    // Source of truth for prefilling state in edit mode.
    const init = mode === "edit" ? (initialRecruitment ?? null) : null
    const isEdit = init !== null
    const initialPositions = init ? mapInitialPositions(init) : null
    // Built once: both the rows and the shape are seeded from it, and
    // `sessionsFromApi` mints a fresh React key per row every time it runs.
    const [initialSessions] = useState<SessionDraft[]>(
        () => sessionsFromApi(init?.sessions),
    )

    // ── Screen + step ────────────────────────────────────────────
    // Create opens on the type picker; edit already knows its type.
    const [screen, setScreen] = useState<"type" | "wizard">(isEdit ? "wizard" : "type")
    const [step, setStep] = useState(0)

    // ── Step 0: Basics ────────────────────────────────────────────
    const [title, setTitle] = useState(() => init?.title ?? "")
    const [shortDesc, setShortDesc] = useState(() => init?.short_description ?? "")
    const [description, setDescription] = useState(() => init?.description ?? "")
    // A pre-migration row (scholarship / direct_recruitment) opens as the type
    // the data migration folds it into, so saving it sends a creatable value.
    const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>(() => (
        init ? toCreatableType(init.recruitment_type, init.event_date) : "open_trial"
    ))
    const [visibility, setVisibility] = useState<RecruitmentVisibility>(() => init?.visibility ?? "public")
    // Everything type-specific — labels, hidden fields, the step list.
    const typeCfg = TYPE_CONFIG[recruitmentType]
    const stepKeys = typeCfg.steps
    const TOTAL_STEPS = stepKeys.length
    const STEP_LABELS = stepKeys.map(k => STEP_META[k].label)
    const [sportId, setSportId] = useState(() => init?.sport?.id ?? "")
    const [gender, setGender] = useState<RecruitmentGender>(() => init?.gender || "all")
    // No longer offered in the wizard (see CRITERIA_PRESETS); carried through
    // unchanged so editing an older record does not silently drop its value.
    const [applicationDeadline, setApplicationDeadline] = useState(() => isoToLocalInput(init?.application_deadline ?? null))
    const [eventDate, setEventDate] = useState(() => isoToLocalInput(init?.event_date ?? null))
    // TRIAL DATES. Rows loaded from the API keep their server ids, and
    // those ids ride all the way back out in the payload — the backend
    // diff-syncs on them, and a row that loses its id is deleted and
    // recreated, which drops the date every applicant picked.
    const [sessions, setSessions] = useState<SessionDraft[]>(
        () => initialSessions,
    )
    // WHICH SHAPE — one day, several days at one ground, or several places.
    // Read back off the loaded rows on an edit (a row with its own venue is
    // a centre, not another day) so an existing city tour opens on the card
    // it was built with rather than resetting to a single date.
    const [trialShape, setTrialShape] = useState<TrialShape>(
        () => shapeFromSessions(initialSessions),
    )
    // SEVERAL PLACES is the one shape with no trial-level ground: each row
    // carries its own location, venue name and map link. The same answer hides
    // those three fields, skips their checks (an error on a field nobody can
    // see is a dead end) and empties their payload keys — see buildPayload.
    // `hasSessions` guards it because the shape is read back off the loaded
    // rows, and a type with no trial dates must never land in it.
    const perCentreVenues = typeCfg.hasSessions && trialShape === "multi_place"
    // Armed by a click on "One day" that would DROP dates — see chooseShape.
    // Holds nothing itself: the count is derived, this is only the "the org
    // has been told" flag.
    const [trimArmed, setTrimArmed] = useState(false)
    const [sessionMode, setSessionMode] = useState<SessionMode>(
        () => init?.session_mode ?? "all",
    )
    const [autoConfirm, setAutoConfirm] = useState(
        () => init?.auto_confirm ?? false,
    )
    const [maxApplications, setMaxApplications] = useState(() => (init?.max_applications != null ? String(init.max_applications) : ""))

    // ── Step 1: Eligibility + Venue ────────────────────────────────
    // A NEW recruitment opens on "specific age groups" with one empty row
    // waiting, because that is what nearly every trial is — a preset chip
    // fills the waiting row, so the common case is one tap. An EDIT shows
    // exactly what was saved.
    const [ageCategories, setAgeCategories] = useState<AgeGroupDraft[]>(
        () => (init ? mapInitialAgeCategories(init) : [newAgeGroup(currentYear(), 0)]),
    )
    // No age groups = open to all ages — there is no separate flag on the
    // server, so this is pure UI state that decides whether we submit [].
    // An existing recruitment with no groups opens open; a new one does not,
    // so the age question is answered rather than defaulted past.
    const [allAges, setAllAges] = useState(
        () => (init ? (init.age_categories?.length ?? 0) === 0 : false),
    )
    const [eligibilityCriteria, setEligibilityCriteria] = useState<EligibilityCriteriaDraft[]>(
        () => (init ? mapInitialEligibilityCriteria(init) : [])
    )
    const [venueName, setVenueName] = useState(() => init?.venue_name ?? "")
    const [venueLink, setVenueLink] = useState(() => init?.venue_link ?? "")
    const [location, setLocation] = useState<PlaceResult | null>(() => (init ? mapInitialLocation(init) : null))
    const [locationOpen, setLocationOpen] = useState(false)
    // The actor's own coordinates, as a 50 km bias circle for place search.
    // Cache-only: never fetches, and null is a perfectly normal answer.
    const placeBias = useProfileBias()

    /**
     * The trial's place, and the venue fields that place already answers.
     *
     * The picker resolves a ground as readily as a city now, and its point is
     * exactly what a map link needs — so the name and the link are filled in
     * from it rather than asked for twice. ONLY EMPTY FIELDS: a venue name or
     * a link the org typed is theirs and is never overwritten, and removing
     * the place again leaves both alone. An org that picked the nearest town
     * instead of their ground edits the name over the top, which is what the
     * hint under the picker tells them to do.
     */
    const pickLocation = (place: PlaceResult | null) => {
        setLocation(place)
        clearFieldError("location")
        if (!place) return
        setVenueName(name => (name.trim() ? name : place.name))
        setVenueLink(link => (link.trim() ? link : mapsLinkFor(place)))
        clearFieldError("venue_name")
        clearFieldError("venue_link")
    }

    // ── Step 2: Positions + Questions ────────────────────────────
    const [anyPosition, setAnyPosition] = useState(() => (initialPositions ? initialPositions.any : true))
    const [selectedPositions, setSelectedPositions] = useState<PositionItem[]>(() => (initialPositions ? initialPositions.list : []))
    const [questions, setQuestions] = useState<QuestionDraft[]>(() => (init ? mapInitialQuestions(init) : []))
    const [benefits, setBenefits] = useState<BenefitDraft[]>(() => (init ? mapInitialBenefits(init) : []))
    const [requirements, setRequirements] = useState<RequirementDraft[]>(() => (init ? mapInitialRequirements(init) : []))
    const [contacts, setContacts] = useState<ContactDraft[]>(() => (init ? mapInitialContacts(init) : []))
    const [applyMethod, setApplyMethod] = useState<ApplyMethod>(() => init?.apply_method ?? "goatza")
    const [externalApplyUrl, setExternalApplyUrl] = useState(() => init?.external_apply_url ?? "")

    // ── Step 3: Media + Payment ───────────────────────────────────
    const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>(() => (init ? mapInitialMedia(init) : []))
    const [isPaid, setIsPaid] = useState(() => init?.is_paid ?? false)
    const [feeAmount, setFeeAmount] = useState(() => (init?.fee_amount != null ? String(init.fee_amount) : ""))
    const [feeCurrency, setFeeCurrency] = useState(() => init?.fee_currency || "INR")
    const [paymentNote, setPaymentNote] = useState(() => init?.payment_note ?? "")

    // ── Submission ────────────────────────────────────────────────
    const [phase, setPhase] = useState<SubmitPhase>("idle")
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [draftSaved, setDraftSaved] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    // "Cancel upload?" — asked before an in-flight media upload is thrown away.
    const [confirmCancel, setConfirmCancel] = useState(false)
    // The upload in flight, so Cancel (and unmount) can pull the plug on the
    // signature request and the PUTs rather than let them finish unseen.
    const abortRef = useRef<AbortController | null>(null)
    // What the overlay says while the request is in flight: set by
    // handleSubmit, read at render.
    const [postingLabel, setPostingLabel] = useState("Publishing…")
    // The visibility menu on the publish button.
    const [publishMenuOpen, setPublishMenuOpen] = useState(false)
    const publishMenuRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!publishMenuOpen) return
        const onDown = (e: MouseEvent | TouchEvent) => {
            if (publishMenuRef.current && !publishMenuRef.current.contains(e.target as Node)) setPublishMenuOpen(false)
        }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("touchstart", onDown)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("touchstart", onDown)
        }
    }, [publishMenuOpen])

    const toast = useToast()
    const router = useRouter()

    // The admin's own phone / email, offered as one-tap contacts. There is no
    // contact book on the org profile, so the account is what "saved" means.
    const authUser = useAuthStore(s => s.user)
    const savedContacts: ContactSuggestion[] = [
        authUser?.phone ? { name: authUser.name ?? "", contact_type: "phone" as const, value: authUser.phone } : null,
        authUser?.email ? { name: authUser.name ?? "", contact_type: "email" as const, value: authUser.email } : null,
    ].filter((c): c is ContactSuggestion => c !== null)
    const { mutateAsync: createRecruitment } = useCreateRecruitment()
    const { mutateAsync: updateRecruitment } = useUpdateRecruitment()
    const { mutateAsync: changeStatus } = useChangeRecruitmentStatus()
    // A saved draft being edited: Save Draft stays offered, and Publish is a
    // real publish rather than "save changes".
    const isDraftRecord = isEdit && init?.status === "draft"
    const canSaveDraft = !isEdit || isDraftRecord
    const fileInputRef = useRef<HTMLInputElement>(null)
    const descriptionRef = useRef<HTMLTextAreaElement>(null)
    const eventDateRef = useRef<HTMLInputElement>(null)

    // event_date is DERIVED server-side from the first date, so mirror it
    // here: the deadline presets, the deadline rule and the live preview
    // all read eventDate, and a stale value would disagree with what the
    // server is about to store.
    const openingSession = typeCfg.hasSessions ? firstSession(sessions) : null
    const openingValue = openingSession ? sessionDateValue(openingSession) : ""
    useEffect(() => {
        if (!typeCfg.hasSessions) return
        setEventDate(openingValue)
    }, [typeCfg.hasSessions, openingValue])

    // ---- the date repeater's writes -------------------------------
    const updateSession = (key: string, patch: Partial<SessionDraft>) => {
        setSessions(rows => rows.map(
            row => (row.key === key ? { ...row, ...patch } : row),
        ))
        clearFieldError("sessions")
    }
    const addSession = () => {
        // The new row arrives already labelled where the shape implies one
        // ("Day 2"), and labels the first row the moment it stops being the
        // only one — see addSessionDraft.
        setSessions(rows => addSessionDraft(rows, trialShape))
        clearFieldError("sessions")
    }
    /**
     * A date landing on ONE row — the single path the date control and the
     * preset chips both take, so the 7 AM default is applied once and in one
     * place. `next` produces the row from the row it is replacing, which is
     * what lets `withDefaultStart` see the empty → set transition.
     */
    const putSessionDate = (
        key: string,
        next: (row: SessionDraft) => SessionDraft,
    ) => {
        setSessions(rows => rows.map(
            row => (row.key === key ? withDefaultStart(row, next(row)) : row),
        ))
        clearFieldError("sessions")
    }
    // Rows whose END TIME field has been asked for, by session key. Off by
    // default — see the field itself — and a row that arrived WITH an end
    // time needs no entry here, which is what `endTimeShown` adds. Revealed
    // stays revealed: clearing the value back out must not snatch the field
    // away mid-edit.
    const [endTimeShownFor, setEndTimeShownFor] = useState<string[]>([])
    const endTimeShown = (row: SessionDraft) =>
        row.endTime !== "" || endTimeShownFor.includes(row.key)
    const showEndTime = (key: string) => setEndTimeShownFor(
        keys => (keys.includes(key) ? keys : [...keys, key]),
    )

    const removeSession = (key: string) => {
        // Never the last one: an open trial has to have a date.
        setSessions(rows => (
            rows.length <= 1 ? rows : rows.filter(row => row.key !== key)
        ))
        clearFieldError("sessions")
    }

    // ---- the trial's shape ----------------------------------------
    // Which row has the full-screen place picker up, by session key. One
    // piece of state rather than a flag per row: the picker is a portal that
    // owns its own mount, so only one may ever be open.
    const [locationOpenFor, setLocationOpenFor] = useState<string | null>(null)

    /**
     * A centre's place, and everything that place already answers.
     *
     * The picked place carries the ground's name and its point, so the venue
     * name and the map link below it are work the org should not have to do
     * twice — and the city it is in is the label that tells this row apart
     * from the others. ONLY EMPTY FIELDS are filled: anything the org typed
     * is theirs, and removing the place again leaves all of it in place
     * rather than wiping text they may have edited.
     */
    const pickSessionLocation = (key: string, place: PlaceResult | null) => {
        if (!place) {
            updateSession(key, { location: null })
            return
        }
        setSessions(rows => rows.map(row => (row.key !== key ? row : {
            ...row,
            location: place,
            title: row.title.trim() ? row.title : titleForPlace(place),
            venueName: row.venueName.trim() ? row.venueName : place.name,
            venueLink: row.venueLink.trim() ? row.venueLink : mapsLinkFor(place),
        })))
        clearFieldError("sessions")
    }

    // The dates "One day" would delete. Rows the org never filled in are not
    // dates, so they are not counted — and the FIRST date is kept, which is
    // the one event_date is derived from.
    const keptSession = firstSession(sessions)
    const datesTrimmedBySingle = sessions.filter(
        row => row.date && row.key !== keptSession?.key,
    ).length

    /**
     * Keep only the first date, then become a single-date trial.
     *
     * DESTRUCTIVE, and never on the first click — see chooseShape. Dropping a
     * row deletes its TrialSession on save, which SET_NULLs the date every
     * applicant picked, so the org confirms it explicitly.
     */
    const trimToSingle = () => {
        setSessions(rows => {
            const keep = firstSession(rows) ?? rows[0]
            return rows
                .filter(row => row.key === keep?.key)
                // One day has no per-row venue UI at all, so anything left
                // here would be invisible state that still got saved.
                .map(row => ({
                    ...row,
                    location: null,
                    venueName: "",
                    venueLink: "",
                }))
        })
        setTrimArmed(false)
        setLocationOpenFor(null)
        setTrialShape("single")
        clearFieldError("sessions")
    }

    /**
     * Pick a shape.
     *
     * Only the per-row VENUE fields belong to multi_place, so leaving it
     * clears them — a stale ground on a row nobody can see any more would be
     * sent on the next save. The dates themselves survive every switch: they
     * are the one thing the org typed that no shape invalidates.
     *
     * The exception is "One day" with dates to lose. That click only ARMS the
     * warning; `trimToSingle` is what acts on it.
     */
    const chooseShape = (next: TrialShape) => {
        if (next === trialShape) return

        if (next === "single" && datesTrimmedBySingle > 0) {
            setTrimArmed(true)
            return
        }

        setTrimArmed(false)
        setLocationOpenFor(null)

        if (trialShape === "multi_place") {
            setSessions(rows => rows.map(row => ({
                ...row,
                location: null,
                venueName: "",
                venueLink: "",
            })))
        }

        // The mirror: several places has no trial-level ground, and the step
        // stops showing those three fields. A value left behind here would be
        // invisible state that still got saved — a second, wrong venue on the
        // listing and a pin in a city the trial never visits.
        if (next === "multi_place") {
            setLocation(null)
            setVenueName("")
            setVenueLink("")
            setLocationOpen(false)
            clearFieldError("location")
            clearFieldError("venue_name")
            clearFieldError("venue_link")
        }

        setTrialShape(next)
        clearFieldError("sessions")
    }

    // Append a heading line to the description and leave the caret under it.
    /**
     * Paste into the description, converted to markdown-lite instead of
     * flattened.
     *
     * A description is usually written in Word, Docs or WhatsApp first. The
     * clipboard carries that formatting as `text/html`, which a textarea drops
     * on the floor — bullets and bold gone, one wall of text left. So the HTML
     * is read for its STRUCTURE and turned into the grammar the detail page
     * renders (see pasteToMarkdownLite.ts). Nothing pasted is ever stored or
     * rendered as markup.
     *
     * Falls through to the browser's own paste when the clipboard offers
     * nothing usable, and respects the 3,000-character limit by hand —
     * `maxLength` does not apply to a programmatic value change.
     */
    const handleDescriptionPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const converted = clipboardToMarkdownLite(e.clipboardData)
        if (converted === null) return

        e.preventDefault()
        const ta = e.currentTarget
        const start = ta.selectionStart ?? description.length
        const end = ta.selectionEnd ?? start
        const room = DESCRIPTION_MAX - (description.length - (end - start))
        const inserted = converted.slice(0, Math.max(0, room))
        const next = description.slice(0, start) + inserted + description.slice(end)

        setDescription(next)
        clearFieldError("description")
        const caret = start + inserted.length
        requestAnimationFrame(() => {
            descriptionRef.current?.setSelectionRange(caret, caret)
        })
    }

    const insertHeading = (heading: string) => {
        const base = description.replace(/\s+$/, "")
        const next = `${base ? base + "\n\n" : ""}${heading}\n`
        setDescription(next)
        requestAnimationFrame(() => {
            const ta = descriptionRef.current
            if (!ta) return
            ta.focus()
            ta.setSelectionRange(next.length, next.length)
        })
    }
    const isSubmitting = phase !== "idle"
    const composing = phase === "idle"

    // ── Unsaved-changes guard ─────────────────────────────────────
    // Snapshot every editable field so we can tell whether the user has
    // touched anything since opening. Draft ids are excluded because they're
    // random per session and would otherwise always read as "changed".
    const snapshot = JSON.stringify({
        // In create mode the type is chosen on the picker screen, before any
        // detail is entered; counting it would confirm-on-discard a blank form.
        recruitmentType: isEdit ? recruitmentType : null,
        title, shortDesc, description, visibility, sportId, gender,
        applicationDeadline, eventDate, maxApplications,
        allAges,
        ageCategories: ageCategories.map(({ id: _id, ...c }) => c),
        eligibilityCriteria: eligibilityCriteria.map(({ id: _id, ...c }) => c),
        venueName, venueLink,
        location: location ? { name: location.name, lat: location.latitude, lng: location.longitude } : null,
        anyPosition,
        selectedPositions: selectedPositions.map(p => ({ position_id: p.position_id })),
        questions: questions.map(({ id: _id, ...q }) => q),
        benefits: benefits.map(({ id: _id, ...b }) => b),
        requirements: requirements.map(({ id: _id, ...r }) => r),
        contacts: contacts.map(({ id: _id, ...c }) => c),
        applyMethod, externalApplyUrl,
        media: mediaEntries.map(m => m.result?.file_url ?? m.preview),
        isPaid, feeAmount, feeCurrency, paymentNote,
    })
    // Captured once on first render → represents the pristine (opened) state.
    const initialSnapshotRef = useRef<string | null>(null)
    if (initialSnapshotRef.current === null) initialSnapshotRef.current = snapshot
    const isDirty = initialSnapshotRef.current !== snapshot

    // ── Back gesture / Escape ─────────────────────────────────────
    // One history entry stands for "the wizard is open". A back press (or
    // Escape) consumes it and lands here; the entry is re-armed by bumping
    // `backEpoch`, which remounts BackGuard. Explicit closes go THROUGH the
    // entry (history.back → popstate → here) so it is never left behind.
    const backRef = useRef<BackToClose | null>(null)
    const [backEpoch, setBackEpoch] = useState(0)
    const closingRef = useRef(false)
    const rearmBack = () => setBackEpoch(e => e + 1)

    const handleBackGesture = () => {
        if (closingRef.current) { closingRef.current = false; onClose(); return }
        // Mid-upload / mid-post there is nothing to go back to; keep the entry.
        if (!composing) { rearmBack(); return }
        if (!onFirstScreen) { goPrev(); rearmBack(); return }
        // First screen: back means leave — with the usual confirm.
        if (isDirty) { setConfirmDiscard(true); rearmBack(); return }
        onClose()
    }

    // Leave now, consuming the history entry on the way out.
    const closeNow = () => {
        closingRef.current = true
        if (backRef.current) backRef.current.requestClose()
        else { closingRef.current = false; onClose() }
    }

    // Close, but confirm first if there are unsaved changes.
    const requestClose = () => {
        if (composing && isDirty) setConfirmDiscard(true)
        else closeNow()
    }

    // ── Cancel an in-flight upload ────────────────────────────────
    // Aborts the signature request / PUTs; the catch in handleSubmit sees
    // the cancellation and stays silent. The draft (every step, the picked
    // photos) is untouched — only the upload progress is thrown away.
    const cancelUpload = () => {
        setConfirmCancel(false)
        const controller = abortRef.current
        abortRef.current = null
        controller?.abort(new Error(UPLOAD_CANCELLED))
        setMediaEntries(prev => prev.map(e => (e.existing ? e : { ...e, status: "idle", progress: 0, error: null })))
        setPhase("idle")
    }

    // Closing the sheet mid-upload must not leave PUTs running for a
    // recruitment that will never be created.
    useEffect(() => () => {
        abortRef.current?.abort(new Error(UPLOAD_CANCELLED))
        abortRef.current = null
    }, [])

    // Escape = one back press. Bubble phase on purpose: the Select sheet, the
    // place picker and the other overlays that stack above capture Escape
    // and stop it, so a press inside them never reaches this.
    const backdropRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return
            const target = e.target instanceof Element ? e.target : null
            const owner = target?.closest('[aria-modal="true"]')
            if (owner && !backdropRef.current?.contains(owner)) return
            e.preventDefault()
            if (confirmDiscard) { setConfirmDiscard(false); return }
            // Mid-upload, Esc asks to cancel (and closes that question again).
            // "Publishing…" cannot be un-sent, so Esc does nothing there.
            if (phase === "uploading") { setConfirmCancel(open => !open); return }
            if (phase !== "idle") return
            if (backRef.current) backRef.current.requestClose()
            else handleBackGesture()
        }
        document.addEventListener("keydown", handler)
        return () => document.removeEventListener("keydown", handler)
    })

    // ── Scroll lock ───────────────────────────────────────────────
    useBodyScrollLock()
    // Text inputs on most steps: the backdrop follows the VISIBLE area so the
    // footer stays above the keyboard (see .backdrop in the stylesheet).
    useVisualViewport()

    // ── Live preview ──────────────────────────────────────────────
    // ≥1024px: a second column beside the form. Below that: a slim strip
    // under the step bar that opens a sheet over the form — never a second
    // column on a phone.
    const isWide = useMediaQuery("(min-width: 1024px)")
    const [previewSheetOpen, setPreviewSheetOpen] = useState(false)

    // ── Scroll position per step ─────────────────────────────────
    // Every step change (Next / Back / step bar / a server error jumping to
    // the offending step) starts the new step at the top — otherwise the body
    // keeps the previous step's scroll offset and lands mid-form.
    const bodyRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0, behavior: "auto" })
        setPreviewSheetOpen(false)
    }, [step, screen])
    // The keyboard shrinks the sheet but not the body's scroll offset, so the
    // field just tapped can end up under the footer: keep it in view.
    useFocusedFieldVisible(bodyRef)

    const { data: sports = [] } = useSportsList()

    // ── The acting org's own sports ──────────────────────────────
    // An org that plays one sport picks it on every single posting. Read from
    // the org detail the admin area already has in cache (no new endpoint, and
    // OrganizationMini in the store carries no sports); CREATE only, so an edit
    // never fires it at all.
    const { data: actingOrg } = useOrgDetail(orgId, "id", !isEdit && !!orgId)

    /**
     * Prefill the sport ONCE, and only into an empty field.
     *
     * A DEFAULT, not a correction: the functional updater keeps whatever is
     * already there, which is what protects a template and a "repeat a past
     * recruitment" clone — both run before this resolves and both set a sport
     * of their own. The ref makes it one-shot, so clearing the select back to
     * "Choose a sport" stays cleared. Editing never reaches here: `init`'s
     * sport is the state's initial value and the query is disabled.
     *
     * No primary flag on file → the first sport, which for a single-sport org
     * is the same answer. No sports at all → nothing happens, exactly as today.
     */
    const sportPrefilled = useRef(false)
    useEffect(() => {
        if (isEdit || sportPrefilled.current) return
        const orgSports = actingOrg?.sports ?? []
        if (orgSports.length === 0) return
        const preferred = orgSports.find(s => s.is_primary) ?? orgSports[0]
        sportPrefilled.current = true
        setSportId(current => current || preferred.id)
    }, [isEdit, actingOrg])

    const sportName = sports.find(s => s.id === sportId)?.name ?? ""
    const positions = sports.find(s => s.id === sportId)?.positions ?? []

    // "U17 Football Open Trial — Kannur": built from whatever is known so
    // far, offered as one tap. Age and city usually arrive later (or from a
    // clone / template), so the suggestion grows as the draft does.
    const ageTitles = allAges ? [] : ageCategories.map(c => c.title.trim()).filter(Boolean)
    const ageWord = ageTitles.length === 0 ? "" : ageTitles.length === 1 ? ageTitles[0] : `${ageTitles[0]}–${ageTitles[ageTitles.length - 1]}`
    const cityWord = location?.city || location?.name || ""
    const suggestedTitle = sportName
        ? `${[ageWord, sportName, typeCfg.label].filter(Boolean).join(" ")}${cityWord ? ` — ${cityWord}` : ""}`
        : ""

    // Changing the sport invalidates any selected positions. Done in the
    // select handler (not an effect) so edit-mode prefilled positions survive
    // the initial mount.
    const handleSportChange = (nextSportId: string) => {
        setSportId(nextSportId)
        setSelectedPositions([])
        setAnyPosition(true)
    }

    // Clear a specific field's inline error (called from the mapped inputs).
    const clearFieldError = (name: string) => {
        setFieldErrors(prev => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })
    }

    // Inline error under a mapped field (populated from a server 400).
    const renderFieldError = (name: string) =>
        fieldErrors[name] ? (
            <span className={styles.fieldErrorText} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                {fieldErrors[name]}
            </span>
        ) : null

    // ── Validation ────────────────────────────────────────────────
    // One rule set, keyed by FIELD, used three ways: on blur of a touched
    // field (that field only), on Next (every field on the step, first
    // failure marked and focused) and on submit (every step). The same
    // `fieldErrors` map a server 400 writes into shows the result inline, so
    // a client failure and a server failure look the same on screen.
    //
    // `forDraft` waives the one thing a draft may legitimately not have yet:
    // the date. Title and sport stay required — the server rejects a body
    // without them, draft or not.
    const validateField = (name: string, forDraft = false): string | null => {
        switch (name) {
            case "title":
                if (!title.trim() || title.trim().length < 5) return "Title must be at least 5 characters."
                return null
            case "short_description":
                // The tagline is optional, but if written it must be meaningful.
                if (shortDesc.trim() && shortDesc.trim().length < 10) return "Card tagline must be at least 10 characters."
                return null
            case "sport_id":
                return sportId ? null : "Please select a sport."
            case "event_date":
                // Only an open trial has a trial day. Without one the deadline
                // is the only date, and the checks below skip a blank event.
                if (typeCfg.hasTrialDate && !eventDate && !forDraft) return `Please set the ${typeCfg.dateLabel.toLowerCase()}.`
                return null
            case "sessions":
                // The server's rules, checked here so the org sees them
                // before submitting rather than as a 400. A draft may be
                // saved with no date yet.
                if (!typeCfg.hasSessions || forDraft) return null
                return validateSessions(sessions, applicationDeadline)
            case "positions":
                // Required only where the position IS the posting ("we need a
                // goalkeeper"). A draft may leave it for later, and a sport
                // with no positions on Goatza has nothing to pick from.
                if (!typeCfg.positionsRequired || forDraft || positions.length === 0) return null
                if (anyPosition || selectedPositions.length === 0) return "Pick the position you're looking for."
                return null
            case "application_deadline": {
                // deadline must be on or before the event date. parseLocalInput
                // resolves a date-only value to end-of-day, so a same-day timed
                // deadline (e.g. 9 AM the morning of a date-only event) is allowed.
                const evDate = parseLocalInput(eventDate)
                const dlDate = parseLocalInput(applicationDeadline)
                if (dlDate && evDate && dlDate > evDate) {
                    return "Application deadline must be on or before the event date."
                }
                // deadline not in the past — but in edit mode, an unchanged past deadline is fine
                if (dlDate) {
                    const initialDeadlineLocal = isoToLocalInput(init?.application_deadline ?? null)
                    const deadlineChanged = applicationDeadline !== initialDeadlineLocal
                    // Date-only resolves to end-of-day (via parseLocalInput), so a
                    // date-only "today" is not treated as past.
                    if ((!isEdit || deadlineChanged) && dlDate.getTime() < Date.now()) {
                        return "Application deadline cannot be in the past."
                    }
                }
                return null
            }
            case "venue_link":
                // Not asked for under "several places", where each centre has
                // its own — so a stale value read back off an edited trial
                // cannot block a step with nothing on it to fix.
                if (perCentreVenues) return null
                if (venueLink.trim() && !isValidHttpUrl(venueLink.trim())) {
                    return "Enter a valid venue map URL (including https://)."
                }
                return null
            case "age_categories":
                // "Open to all ages" submits [], so there is nothing to check.
                if (allAges) return null
                // A NEW recruitment opens with one empty row waiting, so "no
                // rows" and "no row anybody has filled in" are the same
                // state — and the message that helps is the one that names
                // both ways out. A blank row left BESIDE a real group is a
                // different mistake and validateAgeGroups still catches it.
                if (ageCategories.every(c => !c.title.trim())) {
                    return "Add an age group, or choose “Open to all ages”."
                }
                return validateAgeGroups(ageCategories, currentYear())
            case "questions":
                // Hidden for every method but Goatza, and an error on a field
                // nobody can see is a dead end — jumpToField has nothing to
                // focus. The drafts are kept, just not sent.
                if (applyMethod !== "goatza") return null
                for (const q of questions) {
                    if (!q.question.trim()) return "All questions must have text."
                    const hasOptions = ["radio", "select", "checkbox"].includes(q.field_type)
                    if (hasOptions && q.options.filter(o => o.value.trim()).length < 2) return `Question "${q.question || "untitled"}" needs at least 2 options.`
                }
                return null
            case "external_apply_url":
                if (applyMethod !== "external") return null
                if (!externalApplyUrl.trim()) return "Add the external application link."
                if (!isValidHttpUrl(externalApplyUrl.trim())) return "Enter a valid application URL (including https://)."
                return null
            case "contacts": {
                const filledContacts = contacts.filter(c => c.value.trim())
                if (applyMethod === "contact" && filledContacts.length === 0) {
                    return "Add at least one contact for players to apply through."
                }
                for (const c of filledContacts) {
                    if (c.contact_type === "email" && !EMAIL_RE.test(c.value.trim())) {
                        return "Enter a valid email address for the email contact."
                    }
                    if (c.contact_type === "phone" && !PHONE_RE.test(c.value.trim().replace(/[\s\-().]/g, ""))) {
                        return "Enter a valid phone number for the phone contact."
                    }
                }
                return null
            }
            case "fee_amount":
                if (isPaid && !feeAmount) return "Enter the fee amount."
                return null
            case "max_applications":
                if (maxApplications && !(Number(maxApplications) >= 1)) return "Max applications must be at least 1."
                return null
            default:
                return null
        }
    }

    // A failed check, pointing at the input to mark and focus.
    type FieldProblem = { field: string; message: string }

    // Every step's fields in screen order, so the first failure is also the
    // top-most one on the page.
    const STEP_FIELDS: Record<StepKey, string[]> = {
        basics: ["sport_id", "title", "short_description"],
        when_where: ["sessions", "event_date", "application_deadline", "venue_link"],
        who: typeCfg.positionsRequired ? ["positions", "age_categories"] : ["age_categories"],
        pitch: [],
        apply: ["external_apply_url", "auto_confirm", "questions", "contacts", "fee_amount", "max_applications"],
        publish: [],
    }

    const validateStepKey = (key: StepKey, forDraft = false): FieldProblem | null => {
        for (const field of STEP_FIELDS[key]) {
            const message = validateField(field, forDraft)
            if (message) return { field, message }
        }
        return null
    }

    // `s` defaults to the current step but can be passed explicitly so we can
    // validate intermediate steps when jumping ahead via the step bar.
    const validateStep = (s: number = step, forDraft = false): FieldProblem | null => {
        const key = stepKeys[s]
        return key ? validateStepKey(key, forDraft) : null
    }

    // Validate every editable step (all but the last). Used before submit so
    // a required field skipped via the step bar is caught and pointed to,
    // rather than reaching the backend as a vague "This field is required."
    const validateAll = (forDraft = false): { step: number; problem: FieldProblem } | null => {
        for (let s = 0; s < TOTAL_STEPS - 1; s++) {
            const problem = validateStep(s, forDraft)
            if (problem) return { step: s, problem }
        }
        return null
    }

    // The field that should be scrolled to and focused once its step has
    // rendered — set by a failed Next / submit / a server 400.
    const [focusField, setFocusField] = useState<{ name: string; n: number } | null>(null)
    const focusFieldNow = (name: string) => setFocusField(prev => ({ name, n: (prev?.n ?? 0) + 1 }))
    useEffect(() => {
        if (!focusField) return
        // After the step has painted: the field may be on a step that only
        // just mounted.
        const id = window.requestAnimationFrame(() => {
            const root = bodyRef.current
            const group = root?.querySelector<HTMLElement>(`[data-field="${focusField.name}"]`)
            if (!group) return
            group.scrollIntoView({ block: "center", behavior: "smooth" })
            const target = group.querySelector<HTMLElement>(
                'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
            target?.focus({ preventScroll: true })
        })
        return () => window.cancelAnimationFrame(id)
    }, [focusField])

    // Mark a field's problem inline, say so in the toast, and take the user
    // to it — the one path every failed check goes through.
    const reportProblem = (s: number, problem: FieldProblem) => {
        setScreen("wizard")
        setStep(s)
        setFieldErrors({ [problem.field]: problem.message })
        focusFieldNow(problem.field)
        toast.show({
            title: `${STEP_META[stepKeys[s]]?.label ?? "Check your details"} · ${FIELD_LABEL[problem.field] ?? problem.field}`,
            message: problem.message,
            variant: "error",
        })
    }

    // Blur of a touched field re-checks THAT field only: the error appears
    // when the user leaves it, never while they are still typing in it.
    const touchedRef = useRef<Set<string>>(new Set())
    const touchField = (name: string) => {
        touchedRef.current.add(name)
        const message = validateField(name)
        setFieldErrors(prev => {
            if (!message) {
                if (!prev[name]) return prev
                const next = { ...prev }
                delete next[name]
                return next
            }
            if (prev[name] === message) return prev
            return { ...prev, [name]: message }
        })
    }

    const goNext = () => goToStep(step + 1)

    // Back from the first step of a NEW recruitment returns to the type
    // picker; edit mode has no picker, so its first step is the first screen.
    const onFirstScreen = screen === "type" || (isEdit && step === 0)

    const goPrev = () => {
        setFieldErrors({})
        if (step === 0 && !isEdit) { setScreen("type"); return }
        setStep(s => Math.max(0, s - 1))
    }

    const pickType = (t: RecruitmentType) => {
        setRecruitmentType(t)
        // Back to the picker and onto a type with no trial day: drop the date
        // picked under the old type (buildPayload would not send it anyway).
        if (!TYPE_CONFIG[t].hasTrialDate) setEventDate("")
        // The dates belong to the trial, not to the post it just became.
        if (!TYPE_CONFIG[t].hasSessions) {
            setSessions(initialSessionDrafts())
            setSessionMode("all")
            setTrialShape("single")
            setTrimArmed(false)
            setAutoConfirm(false)
        }
        setScreen("wizard")
        setStep(0)
    }

    // ── Repeat a past recruitment / start from a template ─────────
    // The org's newest five, fetched only while the type screen is up (edit
    // never shows it). Same query the org's own list uses.
    const { data: pastPages, isLoading: pastLoading } = useRecruitmentsList(
        { username },
        5,
        screen === "type" && !isEdit,
    )
    const pastRecruitments: Recruitment[] | undefined = pastPages?.pages[0]?.results.slice(0, 5)
    const [cloning, setCloning] = useState<string | null>(null)

    // Everything from a detail payload, minus what must not carry over: dates
    // are cleared (the new trial has its own), media is dropped (photos need
    // a fresh upload) and age groups lose their server ids (they belong to
    // the OTHER recruitment — echoing them would try to update its rows).
    const cloneFrom = (r: RecruitmentDetail) => {
        setRecruitmentType(toCreatableType(r.recruitment_type, r.event_date))
        setVisibility(r.visibility)
        setTitle(r.title)
        setShortDesc(r.short_description)
        setDescription(r.description)
        setSportId(r.sport?.id ?? "")
        setGender(r.gender || "all")
        setEventDate("")
        // Dates are cleared like every other date here, and the new rows
        // carry NO ids: those ids belong to the recruitment being copied,
        // and echoing them would try to edit ITS dates.
        setSessions(initialSessionDrafts())
        // The dates were just cleared, so the shape they implied is gone
        // with them — a cloned city tour starts as one empty date and the
        // org picks its shape again. `sessionMode` is still worth carrying:
        // it is the answer they gave, and it survives until a shape needs it.
        setTrialShape("single")
        setTrimArmed(false)
        setSessionMode(r.session_mode ?? "all")
        setAutoConfirm(r.auto_confirm ?? false)
        setApplicationDeadline("")
        setMaxApplications(r.max_applications != null ? String(r.max_applications) : "")
        const groups = mapInitialAgeCategories(r).map(g => ({ ...g, serverId: undefined }))
        setAgeCategories(groups)
        setAllAges(groups.length === 0)
        setEligibilityCriteria(mapInitialEligibilityCriteria(r))
        setVenueName(r.venue_name)
        setVenueLink(r.venue_link)
        setLocation(mapInitialLocation(r))
        const pos = mapInitialPositions(r)
        setAnyPosition(pos.any)
        setSelectedPositions(pos.list)
        setQuestions(mapInitialQuestions(r))
        setBenefits(mapInitialBenefits(r))
        setRequirements(mapInitialRequirements(r))
        setContacts(mapInitialContacts(r))
        setApplyMethod(r.apply_method)
        setExternalApplyUrl(r.external_apply_url)
        setMediaEntries([])
        setIsPaid(r.is_paid)
        setFeeAmount(r.fee_amount != null ? String(r.fee_amount) : "")
        setFeeCurrency(r.fee_currency || "INR")
        setPaymentNote(r.payment_note)
        setFieldErrors({})
        setScreen("wizard")
        setStep(0)
        const photos = r.media?.length ?? 0
        toast.show({
            title: `Repeating “${r.title}”`,
            message: photos > 0
                ? `Dates cleared. The original had ${photos} photo${photos > 1 ? "s" : ""} — add them again on The pitch.`
                : "Dates cleared — set the new ones on When & where.",
            variant: "success",
        })
    }

    const handleClone = async (r: Recruitment) => {
        setCloning(r.id)
        try {
            // The list row is thin; the detail carries everything.
            const detail = await fetchRecruitmentDetailApi(r.id)
            cloneFrom(detail)
        } catch (err) {
            toast.show({ title: "Couldn't load that recruitment", message: getApiErrorMessage(err, "Please try again."), variant: "error" })
        } finally {
            setCloning(null)
        }
    }

    const applyTemplate = (t: RecruitmentTemplate) => {
        const year = currentYear()
        setRecruitmentType(t.type)
        if (t.title) setTitle(t.title)
        if (t.shortDesc) setShortDesc(t.shortDesc)
        const sport = t.sportName ? sports.find(sx => sx.name.toLowerCase() === t.sportName!.toLowerCase()) : undefined
        if (sport) {
            setSportId(sport.id)
            const wanted = (t.positionNames ?? []).map(n => n.toLowerCase())
            const picked = (sport.positions ?? []).filter(px => wanted.includes(px.name.toLowerCase()))
            setAnyPosition(picked.length === 0)
            setSelectedPositions(picked.map(px => ({ position_id: px.id, name: px.name })))
        }
        const groups: AgeGroupDraft[] = t.ageGroups.map((g, idx) => {
            if ("preset" in g) {
                const { min_birth_year, max_birth_year } = ageToYears(g.preset, year)
                return { id: uid(), title: `U${g.preset}`, min_birth_year, max_birth_year, reporting_time: "", showReportingTime: false, display_order: idx }
            }
            return {
                id: uid(),
                title: g.title,
                min_birth_year: g.maxAge != null ? year - g.maxAge : null,
                max_birth_year: g.minAge != null ? year - g.minAge : null,
                reporting_time: "",
                showReportingTime: false,
                display_order: idx,
            }
        })
        setAgeCategories(groups)
        setAllAges(groups.length === 0)
        setRequirements(t.requirements.map((r, idx) => ({ id: uid(), title: r.title, is_mandatory: r.mandatory ?? true, display_order: idx })))
        setQuestions(t.questions.map(q => ({
            id: uid(),
            question: q.question,
            field_type: q.field_type,
            is_required: q.is_required,
            options: (q.options ?? []).map(value => ({ value })),
        })))
        if (t.benefits) setBenefits(t.benefits.map((b, idx) => ({ id: uid(), title: b.title, icon_name: b.icon, display_order: idx })))
        if (t.criteria) setEligibilityCriteria(t.criteria.map((title, idx) => ({ id: uid(), title, display_order: idx })))
        setFieldErrors({})
        setScreen("wizard")
        setStep(0)
    }

    // Jump to an arbitrary step (from the step bar). Going back is free; going
    // forward validates every step in between and stops at the first offender.
    const goToStep = (target: number) => {
        if (target === step) return
        if (target < step) {
            setFieldErrors({})
            setStep(target)
            return
        }
        for (let s = step; s < target; s++) {
            const problem = validateStep(s)
            if (problem) {
                reportProblem(s, problem)
                return
            }
        }
        setFieldErrors({})
        setStep(Math.min(TOTAL_STEPS - 1, target))
    }

    // From the review step's "still missing" list and the preview's prompts.
    const jumpToField = (field: string) => {
        const key = FIELD_STEP_KEY[field]
        const s = key ? stepKeys.indexOf(key) : -1
        if (s === -1) return
        setFieldErrors({})
        setScreen("wizard")
        setStep(s)
        focusFieldNow(field)
    }

    // ── Media ─────────────────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ""
        if (!files.length) return
        const imageFiles = files.filter(f => f.type.startsWith("image/"))
        const newEntries: MediaEntry[] = imageFiles.slice(0, 5 - mediaEntries.length).map(f => ({
            id: uid(), file: f, originalFile: f, preview: URL.createObjectURL(f),
            progress: 0, status: "idle", error: null, result: null,
        }))
        setMediaEntries(prev => [...prev, ...newEntries])
    }, [mediaEntries])

    const removeMedia = useCallback((id: string) => {
        setMediaEntries(prev => {
            const e = prev.find(x => x.id === id)
            // Only object URLs from local files need revoking; existing media
            // uses remote media-domain URLs.
            if (e && e.preview.startsWith("blob:")) URL.revokeObjectURL(e.preview)
            return prev.filter(x => x.id !== id)
        })
    }, [])

    // Apply a crop from the adjust editor: swap in the cropped file + fresh
    // preview, remembering crop/zoom so re-opening the editor resumes there.
    const cropMedia = useCallback((id: string, file: File, crop: CropState, zoom: number) => {
        setMediaEntries(prev => prev.map(e => {
            if (e.id !== id) return e
            if (e.preview.startsWith("blob:")) URL.revokeObjectURL(e.preview)
            return { ...e, file, preview: URL.createObjectURL(file), crop, zoom }
        }))
    }, [])

    // ── Position toggle ───────────────────────────────────────────
    const togglePosition = (id: string, name: string) => {
        setSelectedPositions(prev => {
            const exists = prev.find(p => p.position_id === id)
            if (exists) return prev.filter(p => p.position_id !== id)
            return [...prev, { position_id: id, name }]
        })
    }

    // ── Build the API payload from current wizard state ───────────
    // The draft object is the modal's state, flattened — see ./draft.ts.
    const draft: RecruitmentDraft = {
        title, shortDesc, description, recruitmentType, visibility, gender, sportId,
        applicationDeadline, eventDate, maxApplications,
        isPaid, feeAmount, feeCurrency, paymentNote, applyMethod, externalApplyUrl,
        venueName, venueLink, location, anyPosition, selectedPositions,
        ageCategories, allAges, eligibilityCriteria, benefits, requirements,
        contacts, questions,
        sessions, sessionMode, trialShape, autoConfirm,
    }

    // ── Preview ───────────────────────────────────────────────────
    // The listing as the player will see it, from the same draft the payload
    // is built from. Un-uploaded photos preview through their object URLs.
    const previewRecruitment = draftToPreviewRecruitment(draft, {
        organization: {
            id: orgId,
            name: displayName || username,
            username,
            type: "",
            logo: userAvatarUrl ?? "",
            headline: "",
            is_verified: false,
        },
        sport: (() => {
            const sp = sports.find(sx => sx.id === sportId)
            return sp ? { id: sp.id, name: sp.name, icon_name: sp.icon_name ?? "", icon_url: sp.icon_url ?? "" } : null
        })(),
        mediaPreviews: mediaEntries.map(m => m.preview),
        id: init?.id,
        status: isEdit ? init?.status : undefined,
        createdAt: init?.created_at,
    })
    const missing = missingFromDraft(draft, mediaEntries.length)

    // The live preview trails typing by ~200ms: re-laying out the card on
    // every keystroke is wasted work and makes the column flicker. Keyed on
    // the dirty-check snapshot, which already changes exactly when the draft
    // does. The review step reads the immediate draft instead.
    const [liveDraft, setLiveDraft] = useState<{ draft: RecruitmentDraft; media: string[] } | null>(null)
    useEffect(() => {
        const t = window.setTimeout(() => setLiveDraft({ draft, media: mediaEntries.map(m => m.preview) }), 200)
        return () => window.clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `snapshot` is the draft's identity; `draft` itself is a fresh object every render
    }, [snapshot])
    const livePreview = liveDraft
        ? draftToPreviewRecruitment(liveDraft.draft, {
            organization: previewRecruitment.organization,
            sport: sports.find(sx => sx.id === liveDraft.draft.sportId)
                ? (() => { const sp = sports.find(sx => sx.id === liveDraft.draft.sportId)!; return { id: sp.id, name: sp.name, icon_name: sp.icon_name ?? "", icon_url: sp.icon_url ?? "" } })()
                : null,
            mediaPreviews: liveDraft.media,
            id: init?.id,
            status: isEdit ? init?.status : undefined,
            createdAt: init?.created_at,
        })
        : previewRecruitment

    // Map a 400's field errors onto the wizard: show inline + jump to the step.
    const applyServerFieldErrors = (err: unknown): void => {
        const errors = getApiFieldErrors(err)
        if (!errors) return
        const known: Record<string, string> = {}
        let jumpStep: number | null = null
        for (const [key, msg] of Object.entries(errors)) {
            const stepKey = FIELD_STEP_KEY[key]
            if (!stepKey) continue
            known[key] = msg
            // Resolved against THIS type's step list, not a fixed index.
            const s = stepKeys.indexOf(stepKey)
            if (s !== -1 && (jumpStep === null || s < jumpStep)) jumpStep = s
        }
        if (Object.keys(known).length > 0) {
            setFieldErrors(known)
            setScreen("wizard")
            if (jumpStep !== null) {
                setStep(jumpStep)
                const first = Object.keys(known).find(k => FIELD_STEP_KEY[k] === stepKeys[jumpStep as number])
                if (first) focusFieldNow(first)
            }
        }
    }

    // ── Submit (create or update) ─────────────────────────────────
    // submitStatus: "draft" saves a draft, "active" publishes. On create it
    // always goes in the body. On edit it is sent only when a saved DRAFT is
    // being published ("active"); editing a live recruitment sends none.
    const handleSubmit = async (submitStatus?: "draft" | "active") => {
        const savingDraft = submitStatus === "draft"
        // Full pre-flight: check every step, not just the current one, so nothing
        // required slips through to the backend as a nameless error.
        const failed = validateAll(savingDraft)
        if (failed) {
            reportProblem(failed.step, failed.problem)
            return
        }
        setFieldErrors({})

        // 1) Upload only newly-added media. Existing media is preserved as-is.
        const uploadedByEntryId = new Map<string, UploadedMedia>()
        const newEntries = mediaEntries.filter(e => !e.existing)

        if (newEntries.length > 0) {
            abortRef.current?.abort(new Error(UPLOAD_CANCELLED))
            const controller = new AbortController()
            abortRef.current = controller
            const { signal } = controller

            setPhase("uploading")
            setMediaEntries(prev => prev.map(e => (e.existing ? e : { ...e, status: "uploading", progress: 0, error: null })))
            try {
                // Compress + derive a thumb for every new entry FIRST, so the
                // whole batch can be signed in one request: `temp_post_id`
                // names one folder per request, and the server's same-folder
                // rule binds a thumbnail to the image it posters.
                const prepared: { entryId: string; full: File; thumb: File }[] = []
                const fileType = await preferredImageType()
                for (const entry of newEntries) {
                    const file = entry.file
                    if (!file) continue
                    // Compress first — same sizes/formats the feed uses. The
                    // name and type follow what was REALLY written.
                    const compressed = await imageCompression(file, { ...IMAGE_COMPRESSION_OPTIONS, fileType })
                    const type = compressed.type || fileType
                    const full = new File([compressed], imageFileName(file.name || "photo", type), { type })
                    // The thumb is the picture here, not a placeholder for
                    // it: the poster card renders this file full-bleed at
                    // the width of the phone, so it is built at 1080 rather
                    // than the app-wide 640.
                    prepared.push({
                        entryId: entry.id,
                        full,
                        thumb: await makeThumb(full, signal, POSTER_THUMB_MAX_DIMENSION),
                    })
                    // Compression is not abortable; stop between files instead.
                    if (signal.aborted) throw new Error(UPLOAD_CANCELLED)
                }

                // files: [img0, thumb0, img1, thumb1, …] → image i at 2i.
                const sigRes = await getUploadConfigApi(
                    "recruitments",
                    prepared.flatMap(p => [
                        describeBlob(p.full, "image"),
                        describeBlob(p.thumb, "thumb"),
                    ]),
                    orgId,
                    signal
                )
                const uploads = sigRes.uploads

                for (let i = 0; i < prepared.length; i++) {
                    const { entryId, full, thumb } = prepared[i]
                    const fullEntry = uploads[i * 2]
                    const thumbEntry = uploads[i * 2 + 1]
                    try {
                        if (!fullEntry || !thumbEntry) throw new Error("Upload config mismatch")

                        // The full image is nearly all of the bytes; the thumb
                        // is the last stretch. Per-entry progress feeds the
                        // aggregate bar, so it moves with the bytes rather
                        // than jumping once per file.
                        // A late progress event from a cancelled upload must
                        // not touch the composer the cancel just put back.
                        const setProgress = (pct: number) => {
                            if (signal.aborted) return
                            setMediaEntries(prev => prev.map(e =>
                                e.id === entryId ? { ...e, progress: Math.min(99, Math.max(e.progress, pct)) } : e
                            ))
                        }
                        await putToR2(full, fullEntry, (loaded, total) =>
                            setProgress(Math.round((loaded / total) * 90)), signal)
                        await putToR2(thumb, thumbEntry, (loaded, total) =>
                            setProgress(90 + Math.round((loaded / total) * 10)), signal)

                        const uploaded: UploadedMedia = {
                            file_url: fullEntry.public_url,
                            public_id: fullEntry.key,
                            media_type: "image",
                            thumbnail_url: thumbEntry.public_url,
                            order: 0,
                        }
                        uploadedByEntryId.set(entryId, uploaded)
                        setMediaEntries(prev => prev.map(e =>
                            e.id === entryId ? { ...e, status: "done", progress: 100, result: uploaded } : e
                        ))
                    } catch (uploadErr) {
                        if (signal.aborted || isUploadCancellation(uploadErr)) throw uploadErr
                        const msg = getApiErrorMessage(uploadErr, "Upload failed. Please try again.")
                        setMediaEntries(prev => prev.map(e => e.id === entryId ? { ...e, status: "error", error: msg } : e))
                        throw new Error(msg)
                    }
                }
            } catch (uploadErr) {
                // The author cancelled: cancelUpload has already put the
                // composer back, so there is nothing to report.
                if (signal.aborted || isUploadCancellation(uploadErr)) return
                const msg = getApiErrorMessage(uploadErr, "Media upload failed. Please try again.")
                toast.show({ title: "Media upload failed", message: msg, variant: "error" })
                setPhase("idle")
                return
            } finally {
                if (abortRef.current === controller) abortRef.current = null
            }
        }

        // 2) Final media list in display order (existing + freshly uploaded).
        const finalMedia: CreateRecruitmentMediaPayload[] = []
        mediaEntries.forEach((e, idx) => {
            const src = e.existing && e.result ? e.result : uploadedByEntryId.get(e.id)
            if (!src) return
            finalMedia.push({
                file_url: src.file_url,
                public_id: src.public_id,
                media_type: src.media_type,
                order: idx,
                ...(src.thumbnail_url ? { thumbnail_url: src.thumbnail_url } : {}),
            })
        })

        // Publishing a saved draft is the one edit that carries a status.
        const publishingDraft = isDraftRecord && submitStatus === "active"
        setPostingLabel(
            savingDraft ? "Saving draft…"
            : isEdit && !publishingDraft ? "Saving changes…"
            : "Publishing…"
        )
        setPhase("posting")

        try {
            const payload = buildPayload(
                draft,
                finalMedia,
                isEdit ? (publishingDraft ? "active" : undefined) : submitStatus,
            )

            if (isEdit && init) {
                // The response says which schedule-ish things moved, so the
                // caller can offer to tell the applicants. Empty when nothing
                // did, and empty when nobody has applied.
                const updated = await updateRecruitment({ recruitmentId: init.id, payload })
                const scheduleChanged = updated?.schedule_changed_fields ?? []
                // The update endpoint drops `status` (draft → active is a state
                // machine transition, not a field), so the publish itself goes
                // through the status endpoint — same call the admin page makes.
                if (publishingDraft) await changeStatus({ recruitmentId: init.id, status: "active" })
                setDraftSaved(isDraftRecord && !publishingDraft)
                setPhase("done")
                toast.show({
                    title: publishingDraft ? "Recruitment published"
                        : isDraftRecord ? "Draft saved" : "Recruitment updated",
                    variant: "success",
                })
                setTimeout(() => {
                    onUpdated?.(init.id, scheduleChanged)
                    closeNow()
                }, 1500)
            } else {
                const res = await createRecruitment(payload)
                const isDraft = submitStatus === "draft"
                setDraftSaved(isDraft)
                setPhase("done")
                toast.show({
                    title: isDraft ? "Draft saved" : "Recruitment published",
                    variant: "success",
                })
                setTimeout(() => {
                    // Land on the org's recruitments list after posting/drafting.
                    // navigateAway pops the wizard's history entry BEFORE the
                    // push, so back from the list does not reopen a ghost.
                    const href = `/organization/admin/${orgId}/recruitments`
                    const back = backRef.current
                    closingRef.current = true
                    onCreated?.(res.recruitment_id)
                    onClose()
                    if (back) back.navigateAway(href)
                    else router.push(href)
                }, 2000)
            }
        } catch (submitErr) {
            const msg = getApiErrorMessage(
                submitErr,
                isEdit ? "Couldn't update recruitment. Please try again."
                    : "Couldn't publish recruitment. Please try again."
            )
            toast.show({
                title: isEdit ? "Couldn't update recruitment" : "Couldn't publish recruitment",
                message: msg,
                variant: "error",
            })
            applyServerFieldErrors(submitErr)
            setPhase("idle")
        }
    }

    const isLastStep = step === TOTAL_STEPS - 1

    // ── Render steps ──────────────────────────────────────────────
    // Six rooms, same for every type; a type may hide a block inside one.
    const hidden = (f: HideableField) => typeCfg.hideFields?.includes(f) ?? false

    const stepIntro = (key: StepKey) => (
        <div className={styles.stepIntro}>
            <h3 className={styles.stepIntroTitle}>{STEP_META[key].title}</h3>
            <p className={styles.stepIntroBlurb}>{STEP_META[key].blurb}</p>
        </div>
    )

    // ── 1. The basics ─────────────────────────────────────────────
    const renderBasics = () => (
        <div className={styles.stepContent}>
            {stepIntro("basics")}

            {/* Sport first: the title reads better once the sport is known,
                and the positions list further in hangs off it. */}
            <div className={styles.fieldGroup} data-field="sport_id">
                <label className={styles.fieldLabel}>Sport <span className={styles.required}>*</span></label>
                {/* handleSportChange, not setSportId — changing the
                    sport clears the positions picked under the old one. */}
                <Select
                    size="sm"
                    aria-label="Sport"
                    sheetTitle="Sport"
                    placeholder="— Select sport —"
                    value={sportId}
                    onChange={v => { handleSportChange(v); clearFieldError("sport_id") }}
                    onBlur={() => touchField("sport_id")}
                    disabled={isSubmitting}
                    options={sports.map(s => ({ value: s.id, label: s.name }))}
                />
                {renderFieldError("sport_id")}
            </div>

            <div className={styles.fieldGroup} data-field="title">
                <label className={styles.fieldLabel}>Title <span className={styles.required}>*</span></label>
                <input className={`${styles.fieldInput} ${fieldErrors.title ? styles.fieldInputInvalid : ""}`} placeholder="e.g. U17 Open Football Trials" value={title} onChange={e => { setTitle(e.target.value); clearFieldError("title") }} onBlur={() => touchField("title")} maxLength={120} disabled={isSubmitting} aria-invalid={!!fieldErrors.title} />
                {suggestedTitle && suggestedTitle !== title.trim() && (
                    <div className={styles.chipRow}>
                        <button
                            type="button"
                            className={styles.insertChip}
                            onClick={() => { setTitle(suggestedTitle); clearFieldError("title") }}
                            disabled={isSubmitting}
                        >
                            <Icon icon="mdi:auto-fix" width={13} height={13} />
                            {suggestedTitle}
                        </button>
                    </div>
                )}
                <span className={styles.fieldHint}>{title.length}/120</span>
                {renderFieldError("title")}
            </div>

            <div className={styles.fieldGroup} data-field="short_description">
                <label className={styles.fieldLabel}>Card tagline <span className={styles.optionalTag}>Optional</span></label>
                <p className={styles.fieldSubLabel}>One line under the title on the card — not a paragraph.</p>
                <input className={`${styles.fieldInput} ${fieldErrors.short_description ? styles.fieldInputInvalid : ""}`} placeholder="e.g. Two-day selection for the U17 academy squad" value={shortDesc} onChange={e => { setShortDesc(e.target.value); clearFieldError("short_description") }} onBlur={() => touchField("short_description")} maxLength={200} disabled={isSubmitting} aria-invalid={!!fieldErrors.short_description} />
                <span className={styles.fieldHint}>{shortDesc.length}/200</span>
                {renderFieldError("short_description")}
            </div>

        </div>
    )

    // ── 2. When & where ───────────────────────────────────────────
    // A row is a DATE in two shapes and a CENTRE in the third. One noun, so
    // the add button, the remove button and every field label agree with the
    // card the org picked.
    const rowNoun = trialShape === "multi_place" ? "centre" : "date"

    const renderWhenWhere = () => (
        <div className={styles.stepContent}>
            {stepIntro("when_where")}

            {/* THE SHAPE, asked before any date, and the FULL WIDTH of the
                step rather than half of the row below — three cards in half a
                modal come out ~90px wide, one word per line. The same cards
                the type picker uses, because this is the same kind of
                question: it decides what a date row asks for.

                It carries the step's "Trial date" label; the row below is
                then the two date columns it was before the chooser existed.
                No data-field of its own — `sessions` stays on the rows, so a
                server error on a date focuses the date and not a card. */}
            {typeCfg.hasSessions && (
                <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>{typeCfg.dateLabel} <span className={styles.required}>*</span></label>

                    <div className={styles.shapeGrid} role="radiogroup" aria-label="How the trial runs">
                        {TRIAL_SHAPES.map(shape => {
                            const picked = trialShape === shape.value
                            return (
                                <button
                                    key={shape.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={picked}
                                    className={`${styles.typeCard} ${styles.shapeCard} ${picked ? styles.shapeCardActive : ""}`}
                                    onClick={() => chooseShape(shape.value)}
                                    disabled={isSubmitting}
                                >
                                    <span className={styles.typeCardIcon}>
                                        <Icon icon={shape.icon} width={20} height={20} />
                                    </span>
                                    <span className={styles.typeCardBody}>
                                        <span className={styles.typeCardLabel}>{shape.label}</span>
                                        <span className={styles.typeCardBlurb}>{shape.blurb}</span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* "One day" with dates to lose. The click that got here
                        changed NOTHING — deleting a date deletes the centre
                        every applicant picked, so it takes a second, named
                        click. */}
                    {trimArmed && datesTrimmedBySingle > 0 && (
                        <div className={styles.shapeWarn} role="alert">
                            <Icon icon="mdi:alert-outline" width={16} height={16} className={styles.shapeWarnIcon} />
                            <div className={styles.shapeWarnBody}>
                                <strong className={styles.shapeWarnTitle}>
                                    {datesTrimmedBySingle === 1
                                        ? "1 date will be removed."
                                        : `${datesTrimmedBySingle} dates will be removed.`}
                                </strong>
                                <span className={styles.shapeWarnText}>
                                    Only the first date is kept.
                                    {(init?.applications_count ?? 0) > 0
                                        ? " Applicants who picked one of the others lose their chosen date."
                                        : ""}
                                </span>
                                <div className={styles.shapeWarnActions}>
                                    <button
                                        type="button"
                                        className={styles.shapeWarnBtn}
                                        onClick={trimToSingle}
                                        disabled={isSubmitting}
                                    >
                                        Keep only the first date
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.shapeWarnCancel}
                                        onClick={() => setTrimArmed(false)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No trial day (looking for players): the deadline is the only
                date, alone and full width rather than half of an empty row. */}
            <div className={typeCfg.hasTrialDate ? styles.fieldRow : undefined}>
                {typeCfg.hasSessions && (
                <div className={styles.fieldGroup} data-field="sessions">
                    {/* ONE date is the default and looks exactly like the
                        single date field always did — presets, then the same
                        date+time control. A second date is opt-in, so a trial
                        on one day never feels heavier than it was. */}
                    {sessions.map((row, idx) => {
                        const isFirst = idx === 0
                        return (
                            <div key={row.key} className={styles.sessionRow}>
                                {isFirst && (
                                    <div className={styles.chipRow} role="group" aria-label="Date presets">
                                        {[
                                            { label: "This Saturday", value: upcomingWeekday(6) },
                                            { label: "Next Sunday", value: upcomingWeekday(0, 1) },
                                        ].map(pr => (
                                            <button
                                                key={pr.label}
                                                type="button"
                                                className={`${styles.choiceChip} ${row.date === pr.value ? styles.choiceChipActive : ""}`}
                                                onClick={() => putSessionDate(
                                                    row.key,
                                                    r => ({ ...r, date: pr.value }),
                                                )}
                                                disabled={isSubmitting}
                                            >
                                                {pr.label}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            className={styles.choiceChip}
                                            onClick={() => {
                                                const el = eventDateRef.current
                                                if (!el) return
                                                el.focus()
                                                if (typeof el.showPicker === "function") { try { el.showPicker() } catch { /* needs a user gesture on some engines */ } }
                                            }}
                                            disabled={isSubmitting}
                                        >
                                            <Icon icon="mdi:calendar-outline" width={13} height={13} />
                                            Pick a date
                                        </button>
                                    </div>
                                )}

                                <div className={styles.sessionMain}>
                                    <DateTimeField
                                        value={sessionDateValue(row)}
                                        onChange={v => putSessionDate(
                                            row.key,
                                            r => withDateValue(r, v),
                                        )}
                                        onBlur={() => touchField("sessions")}
                                        disabled={isSubmitting}
                                        dateRef={isFirst ? eventDateRef : undefined}
                                        invalid={!!fieldErrors.sessions || !!fieldErrors.event_date}
                                    />
                                    {/* Never the last one: an open trial has to
                                        keep a date. */}
                                    {sessions.length > 1 && (
                                        <button
                                            type="button"
                                            className={styles.sessionRemove}
                                            onClick={() => removeSession(row.key)}
                                            disabled={isSubmitting}
                                            aria-label={`Remove ${rowNoun} ${idx + 1}`}
                                            title={`Remove this ${rowNoun}`}
                                        >
                                            <Icon icon="mdi:close" width={15} height={15} />
                                        </button>
                                    )}
                                </div>

                                {row.isCancelled && (
                                    <span className={styles.sessionCancelled}>
                                        Cancelled — applicants who picked this date still see it.
                                    </span>
                                )}

                                {/* A label is only worth asking for once
                                    there is more than one row to tell apart.
                                    One day keeps the date and its end time
                                    and nothing else. */}
                                {trialShape !== "single" && (
                                    <input
                                        className={styles.fieldInput}
                                        type="text"
                                        maxLength={120}
                                        placeholder={trialShape === "multi_place" ? `Label (e.g. "North zone")` : `Label (e.g. "Day 1")`}
                                        value={row.title}
                                        onChange={e => updateSession(row.key, { title: e.target.value })}
                                        disabled={isSubmitting}
                                        aria-label={`Label for ${rowNoun} ${idx + 1}`}
                                    />
                                )}

                                {/* WHEN IT ENDS — asked for, not assumed. An
                                    unlabelled second time box sat under the
                                    start time and read as a duplicate of it,
                                    and most trials never state an end. A row
                                    that already HAS one (an edit) shows the
                                    field straight away. */}
                                {endTimeShown(row) ? (
                                    <div className={styles.sessionEndTime}>
                                        <label
                                            className={styles.sessionEndTimeLabel}
                                            htmlFor={`session-end-${row.key}`}
                                        >
                                            Ends at
                                        </label>
                                        <input
                                            id={`session-end-${row.key}`}
                                            className={`${styles.fieldInput} ${styles.sessionEndTimeInput}`}
                                            type="time"
                                            value={row.endTime}
                                            onChange={e => updateSession(row.key, { endTime: e.target.value })}
                                            disabled={isSubmitting}
                                            aria-label={`End time for ${rowNoun} ${idx + 1}`}
                                        />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.sessionEndAdd}
                                        onClick={() => showEndTime(row.key)}
                                        disabled={isSubmitting}
                                    >
                                        <Icon icon="mdi:plus" width={13} height={13} />
                                        Add end time
                                    </button>
                                )}

                                {/* THE CENTRE'S OWN GROUND — several places
                                    only, and the ONLY ground this shape has:
                                    the trial's own location and venue fields
                                    are not shown for it, because a row and
                                    the trial both answering "where" is one
                                    question asked twice.

                                    The picked place is what puts this centre
                                    on the map: a player searching the city
                                    this date visits finds it by these
                                    coordinates, not the trial's. */}
                                {trialShape === "multi_place" && (
                                    <>
                                        {row.location ? (
                                            <div className={styles.locationPill}>
                                                <Icon icon="mdi:map-marker" width={15} height={15} />
                                                <div className={styles.locationPillText}>
                                                    <span className={styles.locationPillName}>{row.location.name}</span>
                                                    <span className={styles.locationPillSub}>{[row.location.state, row.location.country_code].filter(Boolean).join(", ")}</span>
                                                </div>
                                                <button
                                                    className={styles.locationPillRemove}
                                                    onClick={() => pickSessionLocation(row.key, null)}
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    aria-label={`Remove the place for centre ${idx + 1}`}
                                                >
                                                    <Icon icon="mdi:close" width={13} height={13} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    className={`${styles.locationPickerBtn} ${locationOpenFor === row.key ? styles.locationPickerBtnActive : ""}`}
                                                    onClick={() => setLocationOpenFor(
                                                        open => (open === row.key ? null : row.key),
                                                    )}
                                                    type="button"
                                                    disabled={isSubmitting}
                                                >
                                                    <Icon icon="mdi:map-search-outline" width={16} height={16} />
                                                    Search this centre&apos;s city or ground…
                                                </button>
                                                <p className={styles.fieldHelpNote}>{LOCATION_PICKER_HINT}</p>
                                            </>
                                        )}

                                        {/* Full-screen search, portalled above
                                            this modal. It closes itself on a
                                            pick; the pill keeps its own
                                            remove. */}
                                        {locationOpenFor === row.key && (
                                            <PostLocationPicker
                                                value={row.location}
                                                onChange={place => pickSessionLocation(row.key, place)}
                                                onClose={() => setLocationOpenFor(null)}
                                                disabled={isSubmitting}
                                                bias={placeBias}
                                            />
                                        )}

                                        <div className={styles.sessionExtras}>
                                            <input
                                                className={styles.fieldInput}
                                                type="text"
                                                maxLength={255}
                                                placeholder="Venue name (optional)"
                                                value={row.venueName}
                                                onChange={e => updateSession(row.key, { venueName: e.target.value })}
                                                disabled={isSubmitting}
                                                aria-label={`Venue for centre ${idx + 1}`}
                                            />
                                            <input
                                                className={styles.fieldInput}
                                                type="url"
                                                placeholder="Map link (optional)"
                                                value={row.venueLink}
                                                onChange={e => updateSession(row.key, { venueLink: e.target.value })}
                                                disabled={isSubmitting}
                                                aria-label={`Map link for centre ${idx + 1}`}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )
                    })}

                    {/* One day has nothing to add — that is the whole
                        point of the card. */}
                    {trialShape !== "single" && (
                        <button
                            type="button"
                            className={styles.sessionAdd}
                            onClick={addSession}
                            disabled={isSubmitting}
                        >
                            <Icon icon="mdi:plus" width={14} height={14} />
                            Add another {rowNoun}
                        </button>
                    )}

                    {renderFieldError("sessions")}
                    {renderFieldError("event_date")}

                    {/* SEVERAL DAYS AT ONE GROUND is the only shape that
                        leaves this open, and for it the question is always
                        on — it no longer appears out of nowhere when a
                        second row is added. One day has nothing to choose
                        between, and several places is a pick-one by
                        definition. */}
                    {trialShape === "multi_day" && (
                        <div className={styles.sessionModeBox} data-field="session_mode">
                            {([
                                {
                                    value: "all" as SessionMode,
                                    label: "Players attend every date",
                                    hint: "One trial across several days. Applications close when the first date starts.",
                                },
                                {
                                    value: "choose_one" as SessionMode,
                                    label: "Players pick one date",
                                    hint: "Each date is its own round — a city tour. Applications stay open until the last one.",
                                },
                            ]).map(option => (
                                <label key={option.value} className={styles.sessionModeOption}>
                                    <input
                                        type="radio"
                                        name="session_mode"
                                        value={option.value}
                                        checked={sessionMode === option.value}
                                        onChange={() => setSessionMode(option.value)}
                                        disabled={isSubmitting}
                                    />
                                    <span>
                                        <strong>{option.label}</strong>
                                        <small>{option.hint}</small>
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    {/* No question to ask here — several centres IS a
                        pick-one — but the consequence still has to be on
                        screen, because it decides when applications close
                        and what each applicant is asked to choose. */}
                    {trialShape === "multi_place" && (
                        <p className={styles.sessionHint}>
                            <Icon icon="mdi:information-outline" width={14} height={14} />
                            Players pick one centre.
                        </p>
                    )}
                </div>
                )}
                <div className={styles.fieldGroup} data-field="application_deadline">
                    <label className={styles.fieldLabel}>{typeCfg.deadlineLabel} <span className={styles.optionalTag}>Optional</span></label>
                    {/* Relative to the event: that is how a recruiter thinks
                        about it, and it cannot land after the event. */}
                    <div className={styles.chipRow} role="group" aria-label="Deadline presets">
                        {typeCfg.hasTrialDate && DEADLINE_PRESETS.map(pr => {
                            const day = eventDate ? daysBefore(eventDate, pr.days) : ""
                            // The preset is "which day", so it stays lit when
                            // the recruiter then moves the time off midday.
                            const v = day ? `${day}T${DEADLINE_DEFAULT_TIME}` : ""
                            const active = !!day && applicationDeadline.slice(0, 10) === day
                            return (
                                <button
                                    key={pr.label}
                                    type="button"
                                    className={`${styles.choiceChip} ${active ? styles.choiceChipActive : ""}`}
                                    onClick={() => { setApplicationDeadline(v); clearFieldError("application_deadline") }}
                                    disabled={isSubmitting || !eventDate}
                                    title={eventDate ? undefined : `Set the ${typeCfg.dateLabel.toLowerCase()} first`}
                                >
                                    {pr.label}
                                </button>
                            )
                        })}
                        <button
                            type="button"
                            className={`${styles.choiceChip} ${!applicationDeadline ? styles.choiceChipActive : ""}`}
                            onClick={() => { setApplicationDeadline(""); clearFieldError("application_deadline") }}
                            disabled={isSubmitting}
                        >
                            No deadline
                        </button>
                    </div>
                    <DateTimeField value={applicationDeadline} onChange={v => { setApplicationDeadline(v); clearFieldError("application_deadline") }} onBlur={() => touchField("application_deadline")} disabled={isSubmitting} invalid={!!fieldErrors.application_deadline} defaultTime={DEADLINE_DEFAULT_TIME} />
                    {renderFieldError("application_deadline")}
                </div>
            </div>

            {/* THE TRIAL'S OWN GROUND — every shape but several places.
                There, each row already carries its own location, venue name
                and map link, so asking again here is asking the same question
                twice and inviting two different answers. Switching INTO that
                shape clears these three (chooseShape), and buildPayload sends
                them empty, so nothing stale survives the switch. */}
            {!perCentreVenues && (
            <>
            <div className={styles.sectionDivider} />

            {/* Location */}
            <div className={styles.fieldGroup} data-field="location">
                <label className={styles.fieldLabel}>City / Location</label>
                <p className={styles.fieldSubLabel}>Players nearby find this listing by its location. Without one it only shows up in search.</p>
                {location ? (
                    <div className={styles.locationPill}>
                        <Icon icon="mdi:map-marker" width={15} height={15} />
                        <div className={styles.locationPillText}>
                            <span className={styles.locationPillName}>{location.name}</span>
                            <span className={styles.locationPillSub}>{[location.state, location.country_code].filter(Boolean).join(", ")}</span>
                        </div>
                        <button className={styles.locationPillRemove} onClick={() => setLocation(null)} type="button">
                            <Icon icon="mdi:close" width={13} height={13} />
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            className={`${styles.locationPickerBtn} ${locationOpen ? styles.locationPickerBtnActive : ""}`}
                            onClick={() => setLocationOpen(v => !v)}
                            type="button"
                        >
                            <Icon icon="mdi:map-search-outline" width={16} height={16} />
                            Search city or area…
                        </button>
                        <p className={styles.fieldHelpNote}>{LOCATION_PICKER_HINT}</p>
                    </>
                )}
                {renderFieldError("location")}
                {/* Full-screen search, portalled above this modal.
                    It closes itself on pick; the pill above keeps
                    its own remove. */}
                {locationOpen && (
                    <PostLocationPicker
                        value={location}
                        onChange={pickLocation}
                        onClose={() => setLocationOpen(false)}
                        disabled={isSubmitting}
                        bias={placeBias}
                    />
                )}
            </div>

            {/* Venue details */}
            <div className={styles.fieldGroup} data-field="venue_name">
                <label className={styles.fieldLabel}>Venue Name <span className={styles.optionalTag}>Optional</span></label>
                <input
                    className={styles.fieldInput}
                    placeholder="e.g. Kannur Municipal Stadium"
                    value={venueName}
                    onChange={e => { setVenueName(e.target.value); clearFieldError("venue_name") }}
                    maxLength={200}
                    disabled={isSubmitting}
                />
                {renderFieldError("venue_name")}
            </div>

            <div className={styles.fieldGroup} data-field="venue_link">
                <label className={styles.fieldLabel}>
                    Venue Map Link <span className={styles.optionalTag}>Optional</span>
                </label>
                <div className={styles.venueMapInputWrap}>
                    <Icon icon="mdi:map-outline" width={15} height={15} className={styles.venueMapIcon} />
                    <input
                        className={`${styles.fieldInput} ${styles.venueMapInput} ${fieldErrors.venue_link ? styles.fieldInputInvalid : ""}`}
                        placeholder="Google Maps or any map URL"
                        value={venueLink}
                        onChange={e => { setVenueLink(e.target.value); clearFieldError("venue_link") }}
                        onBlur={() => touchField("venue_link")}
                        aria-invalid={!!fieldErrors.venue_link}
                        type="url"
                        disabled={isSubmitting}
                    />
                </div>
                <p className={styles.fieldHelpNote}>
                    Paste a Google Maps link to the exact ground, if you have one.
                </p>
                {renderFieldError("venue_link")}
            </div>
            </>
            )}

            {!hidden("requirements") && (
                <>
                    <div className={styles.sectionDivider} />

                    {/* What to bring on the day. Sits with the venue because
                        that is when it matters. */}
                    <div className={styles.fieldGroup} data-field="requirements">
                        <label className={styles.fieldLabel}>
                            What to bring <span className={styles.optionalTag}>Optional</span>
                        </label>
                        <p className={styles.fieldSubLabel}>Documents, kit, certificates — tap the asterisk to make one optional.</p>
                        <RequirementsBuilder requirements={requirements} onChange={setRequirements} disabled={isSubmitting} />
                        {renderFieldError("requirements")}
                    </div>
                </>
            )}
        </div>
    )

    // ── 3. Who can come ───────────────────────────────────────────
    // Positions sit mid-step for an open trial (optional, like today) and at
    // the TOP, required, where the position is the whole posting.
    const renderPositions = () => (
        <>
            {/* Positions — or why there are none to pick */}
            {!hidden("positions") && positions.length === 0 && (
                <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabelMuted}>Positions Needed</label>
                    <p className={styles.emptyHint}>
                        <Icon icon="mdi:information-outline" width={13} height={13} />
                        {sportName
                            ? `${sportName} doesn't have positions on Goatza yet — everyone applies to the same pool.`
                            : "Pick a sport on the Basics step to choose positions."}
                    </p>
                </div>
            )}
            {!hidden("positions") && positions.length > 0 && (
                <div className={styles.fieldGroup} data-field="positions">
                    <label className={styles.fieldLabelMuted}>
                        Positions Needed
                        {typeCfg.positionsRequired && <> <span className={styles.required}>*</span></>}
                    </label>
                    <div className={styles.positionGrid}>
                        {/* Any chip — not offered where a position is required:
                            "any position" is not an answer to "who do you need?" */}
                        {!typeCfg.positionsRequired && (
                            <div className={`${styles.positionChip} ${anyPosition ? styles.positionChipSelected : ""}`}>
                                <button
                                    className={styles.positionChipBtn}
                                    onClick={() => { setAnyPosition(true); setSelectedPositions([]) }}
                                    type="button"
                                    disabled={isSubmitting}
                                >
                                    {anyPosition && <Icon icon="mdi:check" width={11} height={11} />}
                                    Any
                                </button>
                            </div>
                        )}
                        {positions.map(p => {
                            const sel = selectedPositions.find(sp => sp.position_id === p.id)
                            return (
                                <div key={p.id} className={`${styles.positionChip} ${sel && !anyPosition ? styles.positionChipSelected : ""}`}>
                                    <button
                                        className={styles.positionChipBtn}
                                        onClick={() => { setAnyPosition(false); togglePosition(p.id, p.name) }}
                                        type="button"
                                        disabled={isSubmitting}
                                    >
                                        {sel && !anyPosition && <Icon icon="mdi:check" width={11} height={11} />}
                                        {p.name}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                    {renderFieldError("positions")}
                </div>
            )}
        </>
    )

    const renderWho = () => (
        <div className={styles.stepContent}>
            {stepIntro("who")}

            {typeCfg.positionsRequired && renderPositions()}

            {/* Age policy */}
            <div className={styles.fieldGroup} data-field="age_categories">
                <label className={styles.fieldLabelMuted}>Age</label>
                <AgeCategoryBuilder
                    categories={ageCategories}
                    onChange={setAgeCategories}
                    disabled={isSubmitting}
                    allAges={allAges}
                    onAllAgesChange={setAllAges}
                />
                {renderFieldError("age_categories")}
            </div>

            {/* Gender — three chips, one tap */}
            <div className={styles.fieldGroup}>
                <label className={styles.fieldLabelMuted}>Gender</label>
                <ChoiceChips
                    ariaLabel="Gender"
                    value={gender}
                    onChange={v => setGender(v as RecruitmentGender)}
                    disabled={isSubmitting}
                    options={[
                        { value: "all", label: "Open to all", icon: "mdi:gender-male-female" },
                        { value: "male", label: "Male", icon: "mdi:gender-male" },
                        { value: "female", label: "Female", icon: "mdi:gender-female" },
                    ]}
                />
            </div>

            {!typeCfg.positionsRequired && renderPositions()}

            {/* Who can attend — free-text lines */}
            <div className={styles.fieldGroup} data-field="eligibility_criteria">
                <label className={styles.fieldLabelMuted}>
                    Who can attend <span className={styles.optionalTag}>Optional</span>
                </label>
                <p className={styles.fieldSubLabel}>
                    Anything else that decides who can turn up — experience, residency, paperwork.
                </p>
                <EligibilityCriteriaBuilder
                    criteria={eligibilityCriteria}
                    onChange={setEligibilityCriteria}
                    disabled={isSubmitting}
                />
                {renderFieldError("eligibility_criteria")}
            </div>
        </div>
    )

    // ── 4. The pitch ──────────────────────────────────────────────
    const renderPitch = () => (
        <div className={styles.stepContent}>
            {stepIntro("pitch")}

            <div className={styles.fieldGroup} data-field="media">
                <label className={styles.fieldLabel}>Banner / Photos</label>
                <p className={styles.fieldSubLabel}>Up to 5 photos, shown in 4:5 portrait — anything wider is centred and cropped to fit. Tap Adjust to reframe one.</p>
                <MediaPreview entries={mediaEntries} onRemove={removeMedia} onCropEntry={cropMedia} disabled={isSubmitting} />
                {renderFieldError("media")}
                {mediaEntries.length < 5 && (
                    <button className={styles.mediaAddBtn} onClick={() => fileInputRef.current?.click()} type="button" disabled={isSubmitting}>
                        <Icon icon="mdi:image-plus-outline" width={18} height={18} />
                        {mediaEntries.length === 0 ? "Add Photos" : `Add More (${mediaEntries.length}/5)`}
                    </button>
                )}
            </div>

            <div className={styles.sectionDivider} />

            <div className={styles.fieldGroup} data-field="description">
                <label className={styles.fieldLabel}>Full Description <span className={styles.optionalTag}>Optional</span></label>
                {/* Headings on tap instead of a placeholder that lists them:
                    the placeholder vanished on the first keystroke, and the
                    three lines are what a good description is built from. */}
                <div className={styles.chipRow} role="group" aria-label="Insert a heading">
                    {DESCRIPTION_HEADINGS.map(h => (
                        <button
                            key={h}
                            type="button"
                            className={styles.insertChip}
                            onClick={() => insertHeading(h)}
                            disabled={isSubmitting || description.includes(h)}
                        >
                            <Icon icon="mdi:plus" width={12} height={12} />
                            {h}
                        </button>
                    ))}
                </div>
                <textarea
                    ref={descriptionRef}
                    className={`${styles.fieldTextarea} ${styles.fieldTextareaTall}`}
                    placeholder="Tell players the full story…"
                    value={description}
                    onChange={e => { setDescription(e.target.value); clearFieldError("description") }}
                    onPaste={handleDescriptionPaste}
                    rows={11}
                    maxLength={DESCRIPTION_MAX}
                    disabled={isSubmitting}
                />
                <p className={styles.fieldHelpNote}>
                    You can use **bold**, *italic* and - bullet points.
                </p>
                <span className={styles.fieldHint}>{description.length}/{DESCRIPTION_MAX}</span>
                {renderFieldError("description")}
            </div>

            <div className={styles.sectionDivider} />

            {/* Benefits */}
            <div className={styles.fieldGroup} data-field="benefits">
                <label className={styles.fieldLabel}>
                    Benefits
                    <span className={styles.fieldLabelMuted}> — what selected players get</span>
                </label>
                <BenefitsBuilder benefits={benefits} onChange={setBenefits} disabled={isSubmitting} />
                {renderFieldError("benefits")}
            </div>
        </div>
    )

    // ── 5. How they apply ─────────────────────────────────────────
    const renderApply = () => (
        <div className={styles.stepContent}>
            {stepIntro("apply")}

            {/* How players apply */}
            <div className={styles.fieldGroup} data-field="external_apply_url">
                <label className={styles.fieldLabel}>How players apply</label>
                <div className={styles.applyMethodRow}>
                    {APPLY_METHODS.map(m => (
                        <button
                            key={m.value}
                            type="button"
                            className={`${styles.applyMethodChip} ${applyMethod === m.value ? styles.applyMethodChipActive : ""}`}
                            onClick={() => { setApplyMethod(m.value); clearFieldError("external_apply_url") }}
                            disabled={isSubmitting}
                        >
                            <Icon icon={m.icon} width={16} height={16} />
                            {m.label}
                        </button>
                    ))}
                </div>

                <div className={styles.applyMethodDesc}>
                    <Icon icon="mdi:information-outline" width={15} height={15} className={styles.applyMethodDescIcon} />
                    <p>{APPLY_METHOD_DESC[applyMethod]}</p>
                </div>

                {applyMethod === "external" && (
                    <div className={styles.applyMethodDetail}>
                        <input
                            className={`${styles.fieldInput} ${fieldErrors.external_apply_url ? styles.fieldInputInvalid : ""}`}
                            placeholder="https://yourclub.com/apply"
                            value={externalApplyUrl}
                            onChange={e => { setExternalApplyUrl(e.target.value); clearFieldError("external_apply_url") }}
                            onBlur={() => touchField("external_apply_url")}
                            aria-invalid={!!fieldErrors.external_apply_url}
                            type="url"
                            disabled={isSubmitting}
                        />
                        {renderFieldError("external_apply_url")}
                    </div>
                )}
            </div>

            {/* AUTO-CONFIRM — a rule about what happens to an application,
                so it belongs with the rest of how they apply. It used to sit
                on "When & where" while FIELD_STEP_KEY already pointed a
                server error on it at this step, which jumped the org to a
                screen the toggle was not on. */}
            {typeCfg.hasSessions && (
                <>
                    <div className={styles.sectionDivider} />

                    <div className={styles.fieldGroup} data-field="auto_confirm">
                        <label className={styles.fieldLabel}>
                            <span className={styles.toggleRow}>
                                Auto-confirm applicants
                                <button
                                    className={`${styles.toggleBtn} ${autoConfirm ? styles.toggleBtnOn : ""}`}
                                    onClick={() => setAutoConfirm(v => !v)}
                                    type="button"
                                    disabled={isSubmitting}
                                    aria-pressed={autoConfirm}
                                    aria-label="Auto-confirm applicants"
                                >
                                    <span className={styles.toggleKnob} />
                                </button>
                            </span>
                        </label>
                        <p className={styles.fieldSubLabel}>
                            Everyone who applies is confirmed instantly and gets their trial pass.
                        </p>
                        {renderFieldError("auto_confirm")}
                    </div>
                </>
            )}

            {/* Application Questions — only the in-app flow ever asks them.
                With "external" or "contact" the player never sees this form,
                so offering the builder would be offering a setting that does
                nothing. Anything already typed STAYS in state (and comes back
                on a switch to Goatza); it is only hidden, and buildPayload
                drops it from the request. */}
            {applyMethod === "goatza" && (
                <>
                    <div className={styles.sectionDivider} />

                    <div className={styles.fieldGroup} data-field="questions">
                        <label className={styles.fieldLabel}>
                            Application Questions
                            <span className={styles.fieldLabelMuted}> — optional</span>
                        </label>
                        <p className={styles.fieldSubLabel}>Ask applicants extra questions. For each one, pick how players should answer.</p>
                        <QuestionBuilder questions={questions} onChange={setQuestions} disabled={isSubmitting} />
                        {renderFieldError("questions")}
                    </div>
                </>
            )}

            <div className={styles.sectionDivider} />

            {/* Contacts */}
            <div className={styles.fieldGroup} data-field="contacts">
                <label className={styles.fieldLabel}>
                    Contact Info
                    <span className={styles.fieldLabelMuted}>
                        {applyMethod === "contact" ? " — required" : " — optional"}
                    </span>
                </label>
                <ContactsBuilder contacts={contacts} onChange={setContacts} disabled={isSubmitting} suggestions={savedContacts} />
                {renderFieldError("contacts")}
            </div>

            {!hidden("entry_fee") && (
                <>
                    <div className={styles.sectionDivider} />

                    <div className={styles.fieldGroup} data-field="fee_amount">
                        <label className={styles.fieldLabel}>
                            <span className={styles.toggleRow}>
                                Entry Fee
                                <button className={`${styles.toggleBtn} ${isPaid ? styles.toggleBtnOn : ""}`} onClick={() => setIsPaid(v => !v)} type="button" disabled={isSubmitting}>
                                    <span className={styles.toggleKnob} />
                                </button>
                            </span>
                        </label>

                        {isPaid && (
                            <>
                                <div className={styles.paymentDisclaimer}>
                                    <Icon icon="mdi:information-outline" width={15} height={15} className={styles.paymentDisclaimerIcon} />
                                    <div>
                                        <strong>Goatza does not manage payments.</strong>
                                        <p>Fee info is shown to applicants only. Collect payment directly from participants.</p>
                                    </div>
                                </div>
                                <div className={styles.fieldRow}>
                                    <div className={styles.fieldGroup} style={{ flex: "0 0 90px" }}>
                                        <label className={styles.fieldLabel}>Currency</label>
                                        <Select
                                            size="sm"
                                            searchable={false}
                                            aria-label="Currency"
                                            sheetTitle="Currency"
                                            value={feeCurrency}
                                            onChange={setFeeCurrency}
                                            disabled={isSubmitting}
                                            options={[
                                                { value: "INR", label: "INR" },
                                                { value: "USD", label: "USD" },
                                                { value: "EUR", label: "EUR" },
                                                { value: "GBP", label: "GBP" },
                                            ]}
                                        />
                                    </div>
                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Amount <span className={styles.required}>*</span></label>
                                        <input className={`${styles.fieldInput} ${fieldErrors.fee_amount ? styles.fieldInputInvalid : ""}`} type="number" min={0} step="0.01" placeholder="e.g. 300" value={feeAmount} onChange={e => { setFeeAmount(e.target.value); clearFieldError("fee_amount") }} onBlur={() => touchField("fee_amount")} disabled={isSubmitting} aria-invalid={!!fieldErrors.fee_amount} />
                                        {renderFieldError("fee_amount")}
                                    </div>
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Payment Note</label>
                                    <input className={styles.fieldInput} placeholder="e.g. Payment collected on event day" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} maxLength={300} disabled={isSubmitting} />
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            <div className={styles.sectionDivider} />

            <div className={styles.fieldGroup} data-field="max_applications">
                <label className={styles.fieldLabel}>Max Applications <span className={styles.optionalTag}>Optional</span></label>
                <input className={`${styles.fieldInput} ${fieldErrors.max_applications ? styles.fieldInputInvalid : ""}`} type="number" min={1} placeholder="e.g. 300 (leave blank for unlimited)" value={maxApplications} onChange={e => { setMaxApplications(e.target.value); clearFieldError("max_applications") }} onBlur={() => touchField("max_applications")} disabled={isSubmitting} aria-invalid={!!fieldErrors.max_applications} />
                {renderFieldError("max_applications")}
            </div>
        </div>
    )

    // ── 6. Publish ────────────────────────────────────────────────
    // The real card and a detail-style block, built from the draft — not a
    // list of counts. What is still missing is listed under it with a jump
    // to the step; informational, never blocking.
    const renderPublish = () => (
        <div className={styles.stepContent}>
            <div className={styles.reviewHeader}>
                <Icon icon="mdi:eye-outline" width={20} height={20} />
                <span>{isEdit && !isDraftRecord ? "This is what players see" : "This is what players will see"}</span>
            </div>

            {!isWide && (
                <RecruitmentPreview
                    recruitment={previewRecruitment}
                    dateLabel={typeCfg.hasTrialDate ? typeCfg.dateLabel : null}
                    onJump={target => jumpToField(PREVIEW_JUMP_FIELD[target])}
                />
            )}

            {missing.length > 0 && (
                <div className={styles.missingBox} data-field="missing">
                    <p className={styles.missingTitle}>
                        <Icon icon="mdi:progress-check" width={14} height={14} />
                        Still missing
                        <span className={styles.fieldLabelMuted}> — optional, but each one helps</span>
                    </p>
                    <ul className={styles.missingList}>
                        {missing.map(m => (
                            <li key={m.key}>
                                <button
                                    type="button"
                                    className={styles.missingLink}
                                    onClick={() => jumpToField(MISSING_FIELD[m.key])}
                                    disabled={isSubmitting}
                                >
                                    <span>{m.label}</span>
                                    <span className={styles.missingJump}>
                                        {STEP_META[FIELD_STEP_KEY[MISSING_FIELD[m.key]]]?.label}
                                        <Icon icon="mdi:arrow-right" width={12} height={12} />
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={styles.reviewPublishNote}>
                <Icon icon="mdi:rocket-launch-outline" width={14} height={14} />
                {isEdit && !isDraftRecord
                    ? `Looks good? Save your changes — visibility stays ${VISIBILITY_LABEL[visibility].toLowerCase()} unless you change it below.`
                    : `Looks good? Publish ${VISIBILITY_ADVERB[visibility]} — or pick who sees it from the arrow next to Publish.`}
            </div>
        </div>
    )

    const STEP_RENDER: Record<StepKey, () => React.ReactNode> = {
        basics: renderBasics,
        when_where: renderWhenWhere,
        who: renderWho,
        pitch: renderPitch,
        apply: renderApply,
        publish: renderPublish,
    }

    const renderStep = () => STEP_RENDER[stepKeys[step] ?? "basics"]()

    const onTypeScreen = screen === "type"

    return (
        <div
            className={styles.backdrop}
            ref={backdropRef}
            onClick={e => { if (e.target === e.currentTarget && composing) requestClose() }}
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? "Edit recruitment" : "Create recruitment"}
        >
            <BackGuard key={backEpoch} onBack={handleBackGesture} controlRef={backRef} />
            <div className={styles.modal}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Avatar src={userAvatarUrl} initials={userInitials} size="sm" />
                        <div>
                            <h2 className={styles.headerTitle}>{isEdit ? "Edit Recruitment" : "Post Recruitment"}</h2>
                            <span className={styles.headerSub}>
                                {onTypeScreen ? (displayName || username) : `${typeCfg.label} · ${displayName || username}`}
                            </span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={requestClose} disabled={isSubmitting} type="button" aria-label="Close">
                        <Icon icon="mdi:close" width={20} height={20} />
                    </button>
                </div>

                {/* Step bar — not on the type screen, which comes before the steps. */}
                {!onTypeScreen && (
                    <StepBar step={step} labels={STEP_LABELS} onStepClick={goToStep} disabled={isSubmitting} />
                )}

                {/* Preview strip (narrow only): the card's title + date, one
                    tap to see the whole thing. Not on the type screen (nothing
                    to preview yet) and not on Publish (the review IS the
                    preview there). */}
                {!isWide && !onTypeScreen && !isLastStep && (
                    <button
                        type="button"
                        className={styles.previewStrip}
                        onClick={() => setPreviewSheetOpen(v => !v)}
                        aria-expanded={previewSheetOpen}
                        aria-controls="recruitment-preview-sheet"
                    >
                        {livePreview.media_previews[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local object URL
                            <img src={livePreview.media_previews[0]} alt="" className={styles.previewStripThumb} />
                        ) : (
                            <span className={styles.previewStripIcon}><Icon icon="mdi:eye-outline" width={16} height={16} /></span>
                        )}
                        <span className={styles.previewStripText}>
                            <span className={styles.previewStripTitle}>{livePreview.title || "Untitled recruitment"}</span>
                            <span className={styles.previewStripSub}>
                                {!typeCfg.hasTrialDate
                                    ? (livePreview.application_deadline
                                        ? `Apply by ${dayjs(livePreview.application_deadline).format("ddd, D MMM")}`
                                        : "No deadline")
                                    : livePreview.event_date
                                        ? dayjs(livePreview.event_date).format("ddd, D MMM")
                                        : `No ${typeCfg.dateLabel.toLowerCase()} yet`}
                                {livePreview.location_name ? ` · ${livePreview.location_name}` : " · No location"}
                            </span>
                        </span>
                        <span className={styles.previewStripCta}>
                            {previewSheetOpen ? "Close" : "Preview"}
                            <Icon icon={previewSheetOpen ? "mdi:chevron-down" : "mdi:chevron-up"} width={14} height={14} />
                        </span>
                    </button>
                )}

                {/* Form + (wide) preview column */}
                <div className={styles.split}>
                <div className={styles.body} ref={bodyRef}>
                    {onTypeScreen ? (
                        <TypePicker
                            onPick={pickType}
                            onClone={handleClone}
                            onTemplate={applyTemplate}
                            past={pastRecruitments}
                            pastLoading={pastLoading}
                            cloning={cloning}
                            disabled={isSubmitting}
                        />
                    ) : renderStep()}
                </div>

                {/* Wide: the preview beside the form, scrolling on its own. */}
                {isWide && !onTypeScreen && (
                    <aside className={styles.previewCol} aria-label="Live preview">
                        <p className={styles.previewColTitle}>
                            <Icon icon="mdi:eye-outline" width={14} height={14} />
                            Live preview
                        </p>
                        <RecruitmentPreview
                            recruitment={livePreview}
                            dateLabel={typeCfg.hasTrialDate ? typeCfg.dateLabel : null}
                            onJump={target => jumpToField(PREVIEW_JUMP_FIELD[target])}
                            compact
                        />
                    </aside>
                )}

                {/* Narrow: the preview as a sheet over the form. */}
                {!isWide && previewSheetOpen && !onTypeScreen && (
                    <div className={styles.previewSheet} id="recruitment-preview-sheet" role="region" aria-label="Preview">
                        <div className={styles.previewSheetHead}>
                            <span className={styles.previewColTitle}>
                                <Icon icon="mdi:eye-outline" width={14} height={14} />
                                Preview
                            </span>
                            <button type="button" className={styles.closeBtn} onClick={() => setPreviewSheetOpen(false)} aria-label="Close preview">
                                <Icon icon="mdi:chevron-down" width={22} height={22} />
                            </button>
                        </div>
                        <div className={styles.previewSheetBody}>
                            <RecruitmentPreview
                                recruitment={livePreview}
                                dateLabel={typeCfg.hasTrialDate ? typeCfg.dateLabel : null}
                                onJump={target => { setPreviewSheetOpen(false); jumpToField(PREVIEW_JUMP_FIELD[target]) }}
                                compact
                            />
                        </div>
                    </div>
                )}
                </div>

                {/* ── Full-sheet upload / publishing / done overlay ── */}
                {phase !== "idle" && (
                    <UploadOverlay
                        entries={mediaEntries.filter(e => !e.existing).map(e => ({
                            preview: e.preview, progress: e.progress, status: e.status, size: e.file?.size ?? 0,
                        }))}
                        phase={phase}
                        postingLabel={postingLabel}
                        doneLabel={draftSaved ? "Draft Saved!" : isEdit && !isDraftRecord ? "Changes Saved!" : "Recruitment Published!"}
                        doneHint={isEdit ? "Updating…" : "Redirecting…"}
                        onCancel={() => setConfirmCancel(true)}
                    />
                )}

                {/* Footer */}
                <div className={styles.footer}>
                    <button className={styles.backBtn} onClick={onFirstScreen ? requestClose : goPrev} disabled={isSubmitting} type="button">
                        {onFirstScreen ? "Cancel" : <><Icon icon="mdi:chevron-left" width={16} height={16} /> Back</>}
                    </button>
                    {!onTypeScreen && (
                        <div className={styles.footerRight}>
                            <span className={styles.stepCounter}>{step + 1} / {TOTAL_STEPS}</span>
                            {/* Save Draft from ANY step: a half-written trial is
                                worth keeping, and a draft is where you come back
                                to finish it. */}
                            {canSaveDraft && (
                                <button className={styles.draftBtn} onClick={() => handleSubmit("draft")} disabled={isSubmitting} type="button">
                                    <Icon icon="mdi:content-save-edit-outline" width={15} height={15} />
                                    <span className={styles.btnLabelFull}>Save Draft</span>
                                    <span className={styles.btnLabelShort}>Draft</span>
                                </button>
                            )}
                            {isLastStep ? (
                                <div className={styles.publishSplit} ref={publishMenuRef}>
                                    <button
                                        className={`${styles.publishBtn} ${styles.publishMain}`}
                                        onClick={() => (isEdit && !isDraftRecord ? handleSubmit() : handleSubmit("active"))}
                                        disabled={isSubmitting}
                                        type="button"
                                    >
                                        <Icon icon={isEdit && !isDraftRecord ? "mdi:content-save-outline" : "mdi:whistle-outline"} width={15} height={15} />
                                        <span className={styles.btnLabelFull}>
                                            {isEdit && !isDraftRecord ? "Save Changes" : `Publish ${VISIBILITY_ADVERB[visibility]}`}
                                        </span>
                                        <span className={styles.btnLabelShort}>{isEdit && !isDraftRecord ? "Save" : "Publish"}</span>
                                    </button>
                                    {/* Visibility rides on the publish button: it is a
                                        publishing decision, not a "basic". */}
                                    <button
                                        className={`${styles.publishBtn} ${styles.publishCaret}`}
                                        onClick={() => setPublishMenuOpen(v => !v)}
                                        disabled={isSubmitting}
                                        type="button"
                                        aria-haspopup="menu"
                                        aria-expanded={publishMenuOpen}
                                        aria-label={`Visibility: ${VISIBILITY_LABEL[visibility]}`}
                                    >
                                        <Icon icon={publishMenuOpen ? "mdi:chevron-down" : "mdi:chevron-up"} width={16} height={16} />
                                    </button>
                                    {publishMenuOpen && (
                                        <div className={styles.publishMenu} role="menu" aria-label="Who can see this" data-field="visibility">
                                            {VISIBILITY_OPTIONS.map(o => (
                                                <button
                                                    key={o.value}
                                                    type="button"
                                                    role="menuitemradio"
                                                    aria-checked={visibility === o.value}
                                                    className={`${styles.publishMenuItem} ${visibility === o.value ? styles.publishMenuItemActive : ""}`}
                                                    onClick={() => { setVisibility(o.value); clearFieldError("visibility"); setPublishMenuOpen(false) }}
                                                >
                                                    <Icon icon={o.icon} width={16} height={16} />
                                                    <span className={styles.publishMenuText}>
                                                        <span>{isEdit && !isDraftRecord ? VISIBILITY_LABEL[o.value] : o.label}</span>
                                                        <span className={styles.publishMenuHint}>{o.hint}</span>
                                                    </span>
                                                    {visibility === o.value && <Icon icon="mdi:check" width={14} height={14} />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button className={styles.nextBtn} onClick={goNext} disabled={isSubmitting} type="button">
                                    Next <Icon icon="mdi:chevron-right" width={16} height={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <input ref={fileInputRef} type="file" hidden multiple accept="image/*" onChange={handleFileChange} />

            {/* Cancel the upload in flight — the draft stays */}
            {confirmCancel && phase === "uploading" && (
                <div className={styles.confirmOverlay} onClick={() => setConfirmCancel(false)}>
                    <div
                        className={styles.confirmDialog}
                        onClick={e => e.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Cancel upload"
                    >
                        <span className={styles.confirmIcon}>
                            <Icon icon="mdi:cloud-off-outline" width={26} height={26} />
                        </span>
                        <h3 className={styles.confirmTitle}>Cancel upload?</h3>
                        <p className={styles.confirmText}>
                            The photos uploaded so far will be thrown away. Everything you&rsquo;ve filled in stays.
                        </p>
                        <div className={styles.confirmActions}>
                            <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmCancel(false)}>
                                Keep uploading
                            </button>
                            <button type="button" className={styles.confirmDiscardBtn} onClick={cancelUpload}>
                                Cancel upload
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Discard-changes confirmation */}
            {confirmDiscard && (
                <div className={styles.confirmOverlay} onClick={() => setConfirmDiscard(false)}>
                    <div
                        className={styles.confirmDialog}
                        onClick={e => e.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Discard unsaved changes"
                    >
                        <span className={styles.confirmIcon}>
                            <Icon icon="mdi:alert-outline" width={26} height={26} />
                        </span>
                        <h3 className={styles.confirmTitle}>{isEdit ? "Discard changes?" : "Discard this recruitment?"}</h3>
                        <p className={styles.confirmText}>
                            The details you&rsquo;ve entered haven&rsquo;t been saved yet and will be lost.
                        </p>
                        <div className={styles.confirmActions}>
                            <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmDiscard(false)}>
                                Keep editing
                            </button>
                            <button type="button" className={styles.confirmDiscardBtn} onClick={() => { setConfirmDiscard(false); closeNow() }}>
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
