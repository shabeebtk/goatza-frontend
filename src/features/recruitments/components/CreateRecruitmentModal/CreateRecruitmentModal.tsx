"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import imageCompression from "browser-image-compression"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "@/features/posts/components/PostLocationPicker/PostLocationPicker"
import PostImageCropper, { type CropState } from "@/features/posts/components/PostImageCropper/PostImageCropper"
import {
    getUploadSignatureApi,
    uploadToCloudinaryApi,
} from "@/features/profile/services/upload.api"
import type { MapboxPlace } from "@/shared/services/mapbox.service"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import styles from "./CreateRecruitmentModal.module.css"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage, getApiFieldErrors } from "@/core/api/getApiErrorMessage"
import { useCreateRecruitment, useUpdateRecruitment } from "../../hooks/useRecruitments"
import type {
    RecruitmentDetail,
    CreateRecruitmentPayload,
    CreateRecruitmentMediaPayload,
    ApplyMethod,
} from "../../services/recruitments.api"
import {
    MIN_BIRTH_YEAR,
    buildAgeCategoriesPayload,
    formatBirthYears,
    validateAgeGroups,
    type AgeGroupDraft,
} from "../../eligibility"

// ── Types ─────────────────────────────────────────────────────

export type RecruitmentType = "open_trial" | "player_looking" | "direct_recruitment" | "scholarship"
export type RecruitmentVisibility = "public" | "followers_only" | "private"
export type RecruitmentGender = "male" | "female" | "all"
export type QuestionFieldType = "short_text" | "long_text" | "select" | "radio" | "checkbox" | "number"

type QuestionDraft = {
    id: string
    question: string
    field_type: QuestionFieldType
    is_required: boolean
    options: { value: string }[]
}

type EligibilityCriteriaDraft = {
    id: string
    title: string
    display_order: number
}

type BenefitDraft = {
    id: string
    title: string
    icon_name: string
    display_order: number
}

type RequirementDraft = {
    id: string
    title: string
    is_mandatory: boolean
    display_order: number
}

type ContactDraft = {
    id: string
    name: string
    contact_type: "phone" | "email"
    value: string
}

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

type PositionItem = { position_id: string; name: string }
type SubmitPhase = "idle" | "uploading" | "posting" | "done"

const TOTAL_STEPS = 5
const STEP_LABELS = ["Basics", "Eligibility & Venue", "Positions", "Media", "Review"]

// Banner photos are cropped to a fixed landscape ratio so every recruitment
// header reads as a clean banner (the detail carousel renders them cover-fit).
const BANNER_ASPECT = 16 / 9

// Mirror the posts image pipeline: compress to WebP before upload so recruitment
// photos use the same sizes/formats as feed photos.
const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 2.5,
    maxWidthOrHeight: 2560,
    initialQuality: 0.9,
    useWebWorker: true,
    fileType: "image/webp" as const,
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

// Maps a backend field-error key → the wizard step that owns it, so a 400 can
// jump the user straight to the offending input and show the message inline.
const FIELD_STEP: Record<string, number> = {
    title: 0,
    short_description: 0,
    sport_id: 0,
    event_date: 0,
    application_deadline: 0,
    max_applications: 0,
    positions: 2,
    external_apply_url: 2,
    contacts: 2,
    fee_amount: 3,
    media: 3,
}

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

const CURRENT_YEAR = new Date().getFullYear()

const AGE_PRESETS = [
    { label: "U13", maxAge: 13 },
    { label: "U15", maxAge: 15 },
    { label: "U17", maxAge: 17 },
    { label: "U19", maxAge: 19 },
    { label: "U21", maxAge: 21 },
    { label: "U23", maxAge: 23 },
]

function ageToYears(maxAge: number) {
    // e.g. U17: born 2008 or 2009 for current year
    const maxBirth = CURRENT_YEAR - (maxAge - 1)
    const minBirth = CURRENT_YEAR - maxAge
    return { min_birth_year: minBirth, max_birth_year: maxBirth }
}

// ── Benefit icon options ───────────────────────────────────────

const BENEFIT_ICONS = [
    { value: "coach", label: "Coaching", icon: "mdi:whistle-outline" },
    { value: "trophy", label: "Trophy", icon: "mdi:trophy-outline" },
    { value: "award", label: "Award", icon: "mdi:medal-outline" },
    { value: "travel", label: "Travel", icon: "mdi:airplane" },
    { value: "kit", label: "Kit", icon: "mdi:tshirt-crew-outline" },
    { value: "certificate", label: "Certificate", icon: "mdi:certificate-outline" },
    { value: "money", label: "Stipend", icon: "mdi:currency-inr" },
    { value: "network", label: "Networking", icon: "mdi:account-group-outline" },
]

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

// Wizard date value format: "YYYY-MM-DD" (date only, no time chosen) OR
// "YYYY-MM-DDTHH:MM" (date + time). A "no time" pick is stored at end-of-day
// (23:59); legacy rows stored it at midnight (00:00). Both sentinels round-trip
// back to date-only here, so the time is only shown when one was really set.
function isoToLocalInput(iso: string | null): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const h = d.getHours(), m = d.getMinutes()
    if ((h === 0 && m === 0) || (h === 23 && m === 59)) return date
    return `${date}T${pad(h)}:${pad(m)}`
}

// Parse a wizard date value as a LOCAL Date. A date-only value means "that
// whole day", so it resolves to END of day (23:59) — this keeps a same-day
// timed deadline ≤ the event and stops a date-only "today" deadline from
// reading as already-past, matching the backend's datetime comparisons.
function parseLocalInput(v: string): Date | null {
    if (!v) return null
    if (v.includes("T")) {
        const d = new Date(v)
        return Number.isNaN(d.getTime()) ? null : d
    }
    const [y, m, d] = v.split("-").map(Number)
    if (!y || !m || !d) return null
    const date = new Date(y, m - 1, d, 23, 59, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
}

// Wizard value → ISO 8601 for the API (undefined when empty/invalid).
function localInputToISO(v: string): string | undefined {
    const d = parseLocalInput(v)
    return d ? d.toISOString() : undefined
}

// Human display of a wizard date value — time shown only when one was set.
function fmtWizardDate(v: string): string | null {
    const d = parseLocalInput(v)
    if (!d) return null
    return v.includes("T")
        ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        : d.toLocaleDateString(undefined, { dateStyle: "medium" } as Intl.DateTimeFormatOptions)
}

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

function mapInitialLocation(r: RecruitmentDetail): MapboxPlace | null {
    if (r.latitude == null || r.longitude == null) return null
    const primary = r.location_name || r.city || "Location"
    return {
        label: [r.location_name || r.city, r.country_code].filter(Boolean).join(", "),
        name: primary,
        place_type: "place",
        state: "",
        country_code: r.country_code,
        latitude: r.latitude,
        longitude: r.longitude,
        external_id: "",
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

function StepBar({ step, onStepClick, disabled }: {
    step: number
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
            {STEP_LABELS.map((label, i) => (
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
                    {i < STEP_LABELS.length - 1 && <div className={styles.stepLine} />}
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

    const chooseAllAges = () => {
        if (allAges) return
        if (categories.length > 0) {
            setConfirmClear(true)
            return
        }
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

    const addPreset = (label: string, maxAge: number) => {
        if (categories.find(c => c.title === label)) return
        const { min_birth_year, max_birth_year } = ageToYears(maxAge)
        onChange([...categories, {
            id: uid(),
            title: label,
            min_birth_year,
            max_birth_year,
            reporting_time: "",
            showReportingTime: false,
            display_order: categories.length,
        }])
    }

    const addCustom = () => {
        onChange([...categories, {
            id: uid(),
            title: "",
            min_birth_year: CURRENT_YEAR - 18,
            max_birth_year: CURRENT_YEAR - 17,
            reporting_time: "",
            showReportingTime: false,
            display_order: categories.length,
        }])
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
                                        max={CURRENT_YEAR}
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
                                        max={CURRENT_YEAR}
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
const CRITERIA_PRESETS = [
    "Kerala residents only",
    "District-level experience required",
    "School / college students only",
    "Registered with the state association",
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
                        placeholder="e.g. Kerala residents only"
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
                Add Requirement
            </button>
        </div>
    )
}

// ── Contacts builder ──────────────────────────────────────────

function ContactsBuilder({ contacts, onChange, disabled }: {
    contacts: ContactDraft[]
    onChange: (c: ContactDraft[]) => void
    disabled: boolean
}) {
    const add = (type: "phone" | "email") => onChange([...contacts, { id: uid(), name: "", contact_type: type, value: "" }])
    const update = (id: string, patch: Partial<ContactDraft>) => onChange(contacts.map(c => c.id === id ? { ...c, ...patch } : c))
    const remove = (id: string) => onChange(contacts.filter(c => c.id !== id))

    return (
        <div className={styles.listBuilder}>
            {contacts.map(c => (
                <div key={c.id} className={styles.contactRow}>
                    <select
                        className={`${styles.fieldSelect} ${styles.contactTypeSelect}`}
                        value={c.contact_type}
                        onChange={e => update(c.id, { contact_type: e.target.value as "phone" | "email" })}
                        disabled={disabled}
                    >
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                    </select>
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
    const HAS_OPTIONS: QuestionFieldType[] = ["radio", "select", "checkbox"]
    const typeHint = (t: QuestionFieldType) => FIELD_TYPES.find(ft => ft.value === t)?.hint ?? ""

    return (
        <div className={styles.questionBuilder}>
            {questions.map((q, i) => (
                <div key={q.id} className={styles.questionCard}>
                    <div className={styles.questionCardHeader}>
                        <span className={styles.questionNum}>Q{i + 1}</span>
                        <select className={styles.fieldTypeSelect} value={q.field_type} onChange={e => updateQ(q.id, { field_type: e.target.value as QuestionFieldType })} disabled={disabled} title="How players answer this question">
                            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                        </select>
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
    const [idx, setIdx] = useState(0)
    // Crop editor — cropSrc is a temp object URL of the ORIGINAL image.
    const [cropId, setCropId] = useState<string | null>(null)
    const [cropSrc, setCropSrc] = useState<string | null>(null)

    useEffect(() => {
        if (idx >= entries.length && entries.length > 0) setIdx(entries.length - 1)
    }, [entries.length, idx])

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
            <div className={styles.previewSlide} style={{ aspectRatio: String(BANNER_ASPECT) }}>
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
                aspect={BANNER_ASPECT}
                initialCrop={cropEntry?.crop}
                initialZoom={cropEntry?.zoom}
                onCancel={closeCropper}
                onApply={applyCrop}
            />
        )}
        </>
    )
}

// ── Review summary helpers ────────────────────────────────────

function ReviewRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
    if (!value) return null
    return (
        <div className={styles.reviewRow}>
            <Icon icon={icon} width={14} height={14} className={styles.reviewRowIcon} />
            <span className={styles.reviewRowLabel}>{label}</span>
            <span className={styles.reviewRowValue}>{value}</span>
        </div>
    )
}

// ── Date + time field ─────────────────────────────────────────
// Renders a separate date input and a 30-minute-step time picker, but reads /
// writes a single wizard value: "YYYY-MM-DD" (no time) or "YYYY-MM-DDTHH:MM".
// Time is optional — the date alone is enough.

function DateTimeField({ value, onChange, disabled }: {
    value: string
    onChange: (v: string) => void
    disabled?: boolean
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
        onChange(timePart ? `${d}T${timePart}` : d)
    }
    const setTime = (t: string) => {
        if (!datePart) return
        onChange(t ? `${datePart}T${t}` : datePart)
    }

    return (
        <div className={styles.dateTimeRow}>
            <input
                className={`${styles.fieldInput} ${styles.dateTimeDate}`}
                type="date"
                value={datePart}
                onChange={e => setDate(e.target.value)}
                disabled={disabled}
            />
            <select
                className={`${styles.fieldSelect} ${styles.dateTimeTime}`}
                value={timePart}
                onChange={e => setTime(e.target.value)}
                disabled={disabled || !datePart}
                title={datePart ? "Time (optional)" : "Pick a date first"}
            >
                <option value="">Time —</option>
                {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    )
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
    onUpdated?: (recruitmentId: string) => void
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

    // ── Step ─────────────────────────────────────────────────────
    const [step, setStep] = useState(0)

    // ── Step 0: Basics ────────────────────────────────────────────
    const [title, setTitle] = useState(() => init?.title ?? "")
    const [shortDesc, setShortDesc] = useState(() => init?.short_description ?? "")
    const [description, setDescription] = useState(() => init?.description ?? "")
    const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>(() => init?.recruitment_type ?? "open_trial")
    const [visibility, setVisibility] = useState<RecruitmentVisibility>(() => init?.visibility ?? "public")
    const [sportId, setSportId] = useState(() => init?.sport?.id ?? "")
    const [gender, setGender] = useState<RecruitmentGender>(() => init?.gender || "all")
    const [experienceLevel, setExperienceLevel] = useState(() => init?.experience_level ?? "")
    const [applicationDeadline, setApplicationDeadline] = useState(() => isoToLocalInput(init?.application_deadline ?? null))
    const [eventDate, setEventDate] = useState(() => isoToLocalInput(init?.event_date ?? null))
    const [maxApplications, setMaxApplications] = useState(() => (init?.max_applications != null ? String(init.max_applications) : ""))

    // ── Step 1: Eligibility + Venue ────────────────────────────────
    const [ageCategories, setAgeCategories] = useState<AgeGroupDraft[]>(() => (init ? mapInitialAgeCategories(init) : []))
    // No age groups = open to all ages — there is no separate flag on the
    // server, so this is pure UI state that decides whether we submit [].
    // A brand-new recruitment (and any existing one without groups) starts
    // open.
    const [allAges, setAllAges] = useState(() => (init?.age_categories?.length ?? 0) === 0)
    const [eligibilityCriteria, setEligibilityCriteria] = useState<EligibilityCriteriaDraft[]>(
        () => (init ? mapInitialEligibilityCriteria(init) : [])
    )
    const [venueName, setVenueName] = useState(() => init?.venue_name ?? "")
    const [venueLink, setVenueLink] = useState(() => init?.venue_link ?? "")
    const [location, setLocation] = useState<MapboxPlace | null>(() => (init ? mapInitialLocation(init) : null))
    const [locationOpen, setLocationOpen] = useState(false)

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

    const toast = useToast()
    const router = useRouter()
    const { mutateAsync: createRecruitment } = useCreateRecruitment()
    const { mutateAsync: updateRecruitment } = useUpdateRecruitment()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isSubmitting = phase !== "idle"
    const composing = phase === "idle"

    // ── Unsaved-changes guard ─────────────────────────────────────
    // Snapshot every editable field so we can tell whether the user has
    // touched anything since opening. Draft ids are excluded because they're
    // random per session and would otherwise always read as "changed".
    const snapshot = JSON.stringify({
        title, shortDesc, description, recruitmentType, visibility, sportId, gender,
        experienceLevel, applicationDeadline, eventDate, maxApplications,
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

    // Close, but confirm first if there are unsaved changes.
    const requestClose = () => {
        if (composing && isDirty) setConfirmDiscard(true)
        else onClose()
    }

    // ── Scroll lock ───────────────────────────────────────────────
    useEffect(() => {
        const orig = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = orig }
    }, [])

    // ── Scroll position per step ─────────────────────────────────
    // Every step change (Next / Back / step bar / a server error jumping to
    // the offending step) starts the new step at the top — otherwise the body
    // keeps the previous step's scroll offset and lands mid-form.
    const bodyRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0, behavior: "auto" })
    }, [step])

    const { data: sports = [] } = useSportsList()
    const positions = sports.find(s => s.id === sportId)?.positions ?? []

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

    // Surface a validation / form error as a toast instead of inline text.
    const showFormError = (msg: string) =>
        toast.show({ title: "Please check your details", message: msg, variant: "error" })

    // ── Validation ────────────────────────────────────────────────
    // `s` defaults to the current step but can be passed explicitly so we can
    // validate intermediate steps when jumping ahead via the step bar.
    const validateStep = (s: number = step): string | null => {
        if (s === 0) {
            if (!title.trim() || title.trim().length < 5) return "Title must be at least 5 characters."
            // Short description is optional, but if written it must be meaningful.
            if (shortDesc.trim() && shortDesc.trim().length < 10) return "Short description must be at least 10 characters."
            if (!sportId) return "Please select a sport."
            if (!eventDate) return "Please set an event / trial date."

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
        }
        if (s === 1) {
            // "Open to all ages" submits [], so there is nothing to check.
            if (!allAges) {
                if (ageCategories.length === 0) {
                    return "Add an age group, or choose “Open to all ages”."
                }
                const ageError = validateAgeGroups(ageCategories, CURRENT_YEAR)
                if (ageError) return ageError
            }
            if (venueLink.trim() && !isValidHttpUrl(venueLink.trim())) {
                return "Enter a valid venue map URL (including https://)."
            }
        }
        if (s === 2) {
            for (const q of questions) {
                if (!q.question.trim()) return "All questions must have text."
                const hasOptions = ["radio", "select", "checkbox"].includes(q.field_type)
                if (hasOptions && q.options.filter(o => o.value.trim()).length < 2) return `Question "${q.question || "untitled"}" needs at least 2 options.`
            }

            // apply method
            if (applyMethod === "external") {
                if (!externalApplyUrl.trim()) return "Add the external application link."
                if (!isValidHttpUrl(externalApplyUrl.trim())) return "Enter a valid application URL (including https://)."
            }
            const filledContacts = contacts.filter(c => c.value.trim())
            if (applyMethod === "contact" && filledContacts.length === 0) {
                return "Add at least one contact for players to apply through."
            }

            // contact format
            for (const c of filledContacts) {
                if (c.contact_type === "email" && !EMAIL_RE.test(c.value.trim())) {
                    return "Enter a valid email address for the email contact."
                }
                if (c.contact_type === "phone" && !PHONE_RE.test(c.value.trim().replace(/[\s\-().]/g, ""))) {
                    return "Enter a valid phone number for the phone contact."
                }
            }
        }
        if (s === 3) {
            if (isPaid && !feeAmount) return "Enter the fee amount."
        }
        return null
    }

    // Validate every editable step (0…3). Used before submit so a required
    // field skipped via the step bar is caught and pointed to, rather than
    // reaching the backend as a vague "This field is required."
    const validateAll = (): { step: number; error: string } | null => {
        for (let s = 0; s < TOTAL_STEPS - 1; s++) {
            const e = validateStep(s)
            if (e) return { step: s, error: e }
        }
        return null
    }

    const goNext = () => goToStep(step + 1)

    const goPrev = () => {
        setFieldErrors({})
        setStep(s => Math.max(0, s - 1))
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
            const err = validateStep(s)
            if (err) {
                showFormError(err)
                setStep(s)
                return
            }
        }
        setFieldErrors({})
        setStep(Math.min(TOTAL_STEPS - 1, target))
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
            // uses remote Cloudinary URLs.
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
    // Shared by create and edit; `media` is passed in because it is
    // resolved asynchronously during submit (existing + freshly uploaded).
    const buildPayload = (
        media: CreateRecruitmentMediaPayload[],
        submitStatus?: "draft" | "active",
    ): CreateRecruitmentPayload => ({
        title: title.trim(),
        short_description: shortDesc.trim(),
        description: description.trim() || undefined,
        recruitment_type: recruitmentType,
        visibility,
        gender,
        sport_id: sportId,
        experience_level: experienceLevel || undefined,
        application_deadline: localInputToISO(applicationDeadline),
        event_date: localInputToISO(eventDate),
        max_applications: maxApplications ? Number(maxApplications) : undefined,
        is_paid: isPaid,
        fee_amount: isPaid && feeAmount ? feeAmount : undefined,
        fee_currency: isPaid ? feeCurrency : undefined,
        payment_note: isPaid && paymentNote ? paymentNote.trim() : undefined,
        apply_method: applyMethod,
        external_apply_url: applyMethod === "external" ? (externalApplyUrl.trim() || undefined) : undefined,
        // status: create-only draft/publish; omitted entirely in edit mode.
        ...(submitStatus ? { status: submitStatus } : {}),
        venue_name: venueName.trim() || undefined,
        venue_link: venueLink.trim() || undefined,
        location: location ? {
            // Mapbox returns poi/place/region/district/locality — only "place"
            // is a true city, but the backend just stores city as a display
            // string, so send the place name for every type (never undefined,
            // which would trip the nested "city is required" validation).
            name: location.name,
            city: location.name,
            country_code: location.country_code,
            latitude: location.latitude,
            longitude: location.longitude,
        } : undefined,
        // send [] if "Any" is selected, otherwise the selected list
        positions: anyPosition
            ? []
            : selectedPositions.map(p => ({ position_id: p.position_id })),
        // "Open to all ages" → an empty list. Otherwise every already-saved
        // group carries its server id so the backend updates it in place.
        age_categories: buildAgeCategoriesPayload(ageCategories, allAges),
        eligibility_criteria: eligibilityCriteria
            .filter(c => c.title.trim())
            .map((c, idx) => ({ title: c.title.trim(), display_order: idx })),
        benefits: benefits
            .filter(b => b.title.trim())
            .map((b, idx) => ({ title: b.title.trim(), icon_name: b.icon_name, display_order: idx })),
        requirements: requirements
            .filter(r => r.title.trim())
            .map((r, idx) => ({ title: r.title.trim(), is_mandatory: r.is_mandatory, display_order: idx })),
        contacts: contacts
            .filter(c => c.value.trim())
            .map(c => ({ name: c.name.trim(), contact_type: c.contact_type, value: c.value.trim() })),
        questions: questions
            .filter(q => q.question.trim())
            .map(q => ({
                question: q.question.trim(),
                field_type: q.field_type,
                is_required: q.is_required,
                options: q.options.filter(o => o.value.trim()).map(o => ({ value: o.value.trim() })),
            })),
        media: media.length > 0 ? media : undefined,
    })

    // Map a 400's field errors onto the wizard: show inline + jump to the step.
    const applyServerFieldErrors = (err: unknown): void => {
        const errors = getApiFieldErrors(err)
        if (!errors) return
        const known: Record<string, string> = {}
        let jumpStep: number | null = null
        for (const [key, msg] of Object.entries(errors)) {
            if (key in FIELD_STEP) {
                known[key] = msg
                const s = FIELD_STEP[key]
                if (jumpStep === null || s < jumpStep) jumpStep = s
            }
        }
        if (Object.keys(known).length > 0) {
            setFieldErrors(known)
            if (jumpStep !== null) setStep(jumpStep)
        }
    }

    // ── Submit (create or update) ─────────────────────────────────
    // submitStatus is only meaningful on create: "draft" saves a draft,
    // "active"/undefined publishes. Edit never sends a status.
    const handleSubmit = async (submitStatus?: "draft" | "active") => {
        // Full pre-flight: check every step, not just the current one, so nothing
        // required slips through to the backend as a nameless error.
        const problem = validateAll()
        if (problem) {
            setStep(problem.step)
            showFormError(problem.error)
            return
        }
        setFieldErrors({})

        // 1) Upload only newly-added media. Existing media is preserved as-is.
        const uploadedByEntryId = new Map<string, UploadedMedia>()
        const newEntries = mediaEntries.filter(e => !e.existing)

        if (newEntries.length > 0) {
            setPhase("uploading")
            setMediaEntries(prev => prev.map(e => (e.existing ? e : { ...e, status: "uploading", progress: 0 })))
            try {
                const sigRes = await getUploadSignatureApi("recruitments", newEntries.length, orgId)
                const uploads = sigRes.uploads
                for (let i = 0; i < newEntries.length; i++) {
                    const entry = newEntries[i]
                    const file = entry.file
                    if (!file) continue
                    const sig = uploads[i]
                    try {
                        // Compress to WebP first — same sizes/formats the feed uses.
                        const compressed = await imageCompression(file, IMAGE_COMPRESSION_OPTIONS)
                        const base = file.name.replace(/\.[^.]+$/, "") || "photo"
                        const toUpload = new File([compressed], `${base}.webp`, { type: compressed.type })
                        const result = await uploadToCloudinaryApi(toUpload, sig)
                        const uploaded: UploadedMedia = {
                            file_url: result.secure_url,
                            public_id: result.public_id,
                            media_type: "image",
                            order: 0,
                        }
                        uploadedByEntryId.set(entry.id, uploaded)
                        setMediaEntries(prev => prev.map(e =>
                            e.id === entry.id ? { ...e, status: "done", progress: 100, result: uploaded } : e
                        ))
                    } catch (uploadErr) {
                        const msg = getApiErrorMessage(uploadErr, "Upload failed. Please try again.")
                        setMediaEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: "error", error: msg } : e))
                        throw new Error(msg)
                    }
                }
            } catch (uploadErr) {
                const msg = getApiErrorMessage(uploadErr, "Media upload failed. Please try again.")
                toast.show({ title: "Media upload failed", message: msg, variant: "error" })
                setPhase("idle")
                return
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

        setPhase("posting")

        try {
            // Edit never sends status; create publishes unless saving a draft.
            const payload = buildPayload(finalMedia, isEdit ? undefined : submitStatus)

            if (isEdit && init) {
                await updateRecruitment({ recruitmentId: init.id, payload })
                setPhase("done")
                toast.show({ title: "Recruitment updated", variant: "success" })
                setTimeout(() => {
                    onUpdated?.(init.id)
                    onClose()
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
                    onCreated?.(res.recruitment_id)
                    onClose()
                    // Land on the org's recruitments list after posting/drafting.
                    router.push(`/organization/admin/${orgId}/recruitments`)
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
    const renderStep = () => {
        switch (step) {
            // ── Step 0: Basics ────────────────────────────────────────
            case 0:
                return (
                    <div className={styles.stepContent}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Title <span className={styles.required}>*</span></label>
                            <input className={styles.fieldInput} placeholder="e.g. U17 Open Football Trials" value={title} onChange={e => { setTitle(e.target.value); clearFieldError("title") }} maxLength={120} disabled={isSubmitting} />
                            <span className={styles.fieldHint}>{title.length}/120</span>
                            {renderFieldError("title")}
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Short Description <span className={styles.optionalTag}>Optional</span></label>
                            <input className={styles.fieldInput} placeholder="Brief tagline shown on the card" value={shortDesc} onChange={e => { setShortDesc(e.target.value); clearFieldError("short_description") }} maxLength={200} disabled={isSubmitting} />
                            <span className={styles.fieldHint}>{shortDesc.length}/200</span>
                            {renderFieldError("short_description")}
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Full Description</label>
                            <textarea className={styles.fieldTextarea} placeholder="Describe the trial — what to expect, what to bring, selection process…" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={3000} disabled={isSubmitting} />
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Type <span className={styles.required}>*</span></label>
                                <select className={styles.fieldSelect} value={recruitmentType} onChange={e => setRecruitmentType(e.target.value as RecruitmentType)} disabled={isSubmitting}>
                                    <option value="open_trial">Open Trial</option>
                                    <option value="player_looking">Player Looking</option>
                                    <option value="direct_recruitment">Direct Recruitment</option>
                                    <option value="scholarship">Scholarship</option>
                                </select>
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Sport <span className={styles.required}>*</span></label>
                                <select className={styles.fieldSelect} value={sportId} onChange={e => handleSportChange(e.target.value)} disabled={isSubmitting}>
                                    <option value="">— Select sport —</option>
                                    {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Gender lives on the Eligibility step — it is part of
                            "who can attend", not a basic. */}
                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Experience Level</label>
                                <select className={styles.fieldSelect} value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)} disabled={isSubmitting}>
                                    <option value="">— Any —</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="district">District</option>
                                    <option value="state">State</option>
                                    <option value="national">National</option>
                                    <option value="international">International</option>
                                </select>
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Visibility</label>
                                <select className={styles.fieldSelect} value={visibility} onChange={e => setVisibility(e.target.value as RecruitmentVisibility)} disabled={isSubmitting}>
                                    <option value="public">Public</option>
                                    <option value="followers_only">Followers Only</option>
                                    <option value="private">Private</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Trial / Event Date <span className={styles.required}>*</span></label>
                                <DateTimeField value={eventDate} onChange={v => { setEventDate(v); clearFieldError("event_date") }} disabled={isSubmitting} />
                                {renderFieldError("event_date")}
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Application Deadline <span className={styles.optionalTag}>Optional</span></label>
                                <DateTimeField value={applicationDeadline} onChange={v => { setApplicationDeadline(v); clearFieldError("application_deadline") }} disabled={isSubmitting} />
                                {renderFieldError("application_deadline")}
                            </div>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Max Applications</label>
                            <input className={styles.fieldInput} type="number" min={1} placeholder="e.g. 300 (leave blank for unlimited)" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} disabled={isSubmitting} />
                        </div>
                    </div>
                )

            // ── Step 1: Eligibility + Venue ───────────────────────────
            case 1:
                return (
                    <div className={styles.stepContent}>
                        {/* Eligibility — who can attend. Displayed on the
                            listing exactly as written; Goatza never checks a
                            player against it. */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Eligibility</label>
                            <p className={styles.fieldSubLabel}>
                                Tell players who this trial is for. It&rsquo;s shown on the listing —
                                you verify it at the venue.
                            </p>
                        </div>

                        {/* Age policy */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabelMuted}>Age</label>
                            <AgeCategoryBuilder
                                categories={ageCategories}
                                onChange={setAgeCategories}
                                disabled={isSubmitting}
                                allAges={allAges}
                                onAllAgesChange={setAllAges}
                            />
                        </div>

                        {/* Gender */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabelMuted}>Gender</label>
                            <select className={styles.fieldSelect} value={gender} onChange={e => setGender(e.target.value as RecruitmentGender)} disabled={isSubmitting}>
                                <option value="all">Open to all</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>

                        {/* Other criteria */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabelMuted}>
                                Other criteria <span className={styles.optionalTag}>Optional</span>
                            </label>
                            <p className={styles.fieldSubLabel}>
                                Anything else that decides who can turn up — residency, experience, paperwork.
                            </p>
                            <EligibilityCriteriaBuilder
                                criteria={eligibilityCriteria}
                                onChange={setEligibilityCriteria}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className={styles.sectionDivider} />

                        {/* Location */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>City / Location</label>
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
                                <button
                                    className={`${styles.locationPickerBtn} ${locationOpen ? styles.locationPickerBtnActive : ""}`}
                                    onClick={() => setLocationOpen(v => !v)}
                                    type="button"
                                >
                                    <Icon icon="mdi:map-search-outline" width={16} height={16} />
                                    Search city or area…
                                </button>
                            )}
                            {/* Full-screen search, portalled above this modal.
                                It closes itself on pick; the pill above keeps
                                its own remove. */}
                            {locationOpen && (
                                <PostLocationPicker
                                    value={location}
                                    onChange={setLocation}
                                    onClose={() => setLocationOpen(false)}
                                    disabled={isSubmitting}
                                />
                            )}
                        </div>

                        {/* Venue details */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Venue Name</label>
                            <input
                                className={styles.fieldInput}
                                placeholder="e.g. Kannur Municipal Stadium"
                                value={venueName}
                                onChange={e => setVenueName(e.target.value)}
                                maxLength={200}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Venue Map Link <span className={styles.optionalTag}>Optional</span>
                            </label>
                            <div className={styles.venueMapInputWrap}>
                                <Icon icon="mdi:map-outline" width={15} height={15} className={styles.venueMapIcon} />
                                <input
                                    className={`${styles.fieldInput} ${styles.venueMapInput}`}
                                    placeholder="Google Maps or any map URL"
                                    value={venueLink}
                                    onChange={e => setVenueLink(e.target.value)}
                                    type="url"
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>
                    </div>
                )

            // ── Step 2: Positions, Questions, Benefits, Requirements, Contacts
            case 2:
                return (
                    <div className={styles.stepContent}>
                        {/* Positions */}
                        {positions.length > 0 && (
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Positions Needed</label>
                                <div className={styles.positionGrid}>
                                    {/* Any chip */}
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
                            </div>
                        )}

                        <div className={styles.sectionDivider} />

                        {/* Application Questions */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Application Questions
                                <span className={styles.fieldLabelMuted}> — optional</span>
                            </label>
                            <p className={styles.fieldSubLabel}>Ask applicants extra questions. For each one, pick how players should answer.</p>
                            <QuestionBuilder questions={questions} onChange={setQuestions} disabled={isSubmitting} />
                        </div>

                        <div className={styles.sectionDivider} />

                        {/* Benefits */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Benefits
                                <span className={styles.fieldLabelMuted}> — what selected players get</span>
                            </label>
                            <BenefitsBuilder benefits={benefits} onChange={setBenefits} disabled={isSubmitting} />
                        </div>

                        <div className={styles.sectionDivider} />

                        {/* Requirements */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Requirements
                                <span className={styles.fieldLabelMuted}> — what players must bring</span>
                            </label>
                            <RequirementsBuilder requirements={requirements} onChange={setRequirements} disabled={isSubmitting} />
                        </div>

                        <div className={styles.sectionDivider} />

                        {/* How players apply */}
                        <div className={styles.fieldGroup}>
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
                                        className={styles.fieldInput}
                                        placeholder="https://yourclub.com/apply"
                                        value={externalApplyUrl}
                                        onChange={e => { setExternalApplyUrl(e.target.value); clearFieldError("external_apply_url") }}
                                        type="url"
                                        disabled={isSubmitting}
                                    />
                                    {renderFieldError("external_apply_url")}
                                </div>
                            )}
                        </div>

                        <div className={styles.sectionDivider} />

                        {/* Contacts */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Contact Info
                                <span className={styles.fieldLabelMuted}>
                                    {applyMethod === "contact" ? " — required" : " — optional"}
                                </span>
                            </label>
                            <ContactsBuilder contacts={contacts} onChange={setContacts} disabled={isSubmitting} />
                            {renderFieldError("contacts")}
                        </div>
                    </div>
                )

            // ── Step 3: Media + Payment ───────────────────────────────
            case 3:
                return (
                    <div className={styles.stepContent}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Banner / Photos</label>
                            <p className={styles.fieldSubLabel}>Up to 5 photos. Tap Adjust to reframe each one — they’re cropped to a clean banner shape.</p>
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

                        <div className={styles.fieldGroup}>
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
                                            <select className={styles.fieldSelect} value={feeCurrency} onChange={e => setFeeCurrency(e.target.value)} disabled={isSubmitting}>
                                                <option value="INR">INR</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                                <option value="GBP">GBP</option>
                                            </select>
                                        </div>
                                        <div className={styles.fieldGroup}>
                                            <label className={styles.fieldLabel}>Amount <span className={styles.required}>*</span></label>
                                            <input className={styles.fieldInput} type="number" min={0} step="0.01" placeholder="e.g. 300" value={feeAmount} onChange={e => { setFeeAmount(e.target.value); clearFieldError("fee_amount") }} disabled={isSubmitting} />
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
                    </div>
                )

            // ── Step 4: Review ────────────────────────────────────────
            case 4:
                return (
                    <div className={styles.stepContent}>
                        <div className={styles.reviewHeader}>
                            <Icon icon="mdi:clipboard-check-outline" width={20} height={20} />
                            <span>{isEdit ? "Review your changes" : "Review before publishing"}</span>
                        </div>

                        <div className={styles.reviewSection}>
                            <p className={styles.reviewSectionTitle}>Basics</p>
                            <ReviewRow icon="mdi:format-title" label="Title" value={title} />
                            <ReviewRow icon="mdi:text-short" label="Short Desc." value={shortDesc} />
                            <ReviewRow icon="mdi:soccer" label="Sport" value={sports.find(s => s.id === sportId)?.name} />
                            <ReviewRow icon="mdi:tag-outline" label="Type" value={recruitmentType.replace(/_/g, " ")} />
                            <ReviewRow icon="mdi:eye-outline" label="Visibility" value={visibility.replace(/_/g, " ")} />
                            <ReviewRow icon="mdi:calendar" label="Event Date" value={fmtWizardDate(eventDate)} />
                            <ReviewRow icon="mdi:calendar-clock" label="Deadline" value={fmtWizardDate(applicationDeadline)} />
                        </div>

                        <div className={styles.reviewSection}>
                            <p className={styles.reviewSectionTitle}>Eligibility</p>
                            <ReviewRow
                                icon="mdi:cake-variant-outline"
                                label="Age"
                                value={allAges || ageCategories.length === 0
                                    ? "All ages"
                                    : `${ageCategories.length} group${ageCategories.length > 1 ? "s" : ""}`}
                            />
                            {!allAges && ageCategories.map(c => (
                                <ReviewRow
                                    key={c.id}
                                    icon="mdi:account-group-outline"
                                    label={c.title || "Untitled group"}
                                    value={`${formatBirthYears(c.min_birth_year, c.max_birth_year)}${c.showReportingTime && c.reporting_time ? ` · Reporting ${c.reporting_time}` : ""}`}
                                />
                            ))}
                            <ReviewRow
                                icon="mdi:gender-male-female"
                                label="Gender"
                                value={gender === "all" ? "Open" : gender}
                            />
                            <ReviewRow
                                icon="mdi:clipboard-text-outline"
                                label="Other criteria"
                                value={eligibilityCriteria.filter(c => c.title.trim()).length > 0
                                    ? eligibilityCriteria.filter(c => c.title.trim()).map(c => c.title.trim()).join(", ")
                                    : null}
                            />
                        </div>

                        <div className={styles.reviewSection}>
                            <p className={styles.reviewSectionTitle}>Venue</p>
                            <ReviewRow icon="mdi:map-marker-outline" label="City" value={location?.name} />
                            <ReviewRow icon="mdi:stadium-outline" label="Venue" value={venueName || null} />
                            <ReviewRow icon="mdi:map-outline" label="Map Link" value={venueLink ? "Added" : null} />
                        </div>

                        <div className={styles.reviewSection}>
                            <p className={styles.reviewSectionTitle}>Positions & Questions</p>
                            <ReviewRow icon="mdi:run" label="Positions" value={anyPosition ? "Any" : selectedPositions.map(p => p.name).join(", ")} />
                            <ReviewRow icon="mdi:send-outline" label="Apply via" value={applyMethod === "goatza" ? "Goatza app" : applyMethod === "external" ? "External link" : "Contact"} />
                            <ReviewRow icon="mdi:help-circle-outline" label="Questions" value={questions.length > 0 ? `${questions.length} question${questions.length > 1 ? "s" : ""}` : null} />
                            <ReviewRow icon="mdi:gift-outline" label="Benefits" value={benefits.length > 0 ? `${benefits.length} benefit${benefits.length > 1 ? "s" : ""}` : null} />
                            <ReviewRow icon="mdi:clipboard-list-outline" label="Requirements" value={requirements.length > 0 ? `${requirements.length} item${requirements.length > 1 ? "s" : ""}` : null} />
                            <ReviewRow icon="mdi:phone-outline" label="Contacts" value={contacts.length > 0 ? `${contacts.length} contact${contacts.length > 1 ? "s" : ""}` : null} />
                        </div>

                        <div className={styles.reviewSection}>
                            <p className={styles.reviewSectionTitle}>Media & Payment</p>
                            <ReviewRow icon="mdi:image-multiple-outline" label="Photos" value={mediaEntries.length > 0 ? `${mediaEntries.length} photo${mediaEntries.length > 1 ? "s" : ""}` : "None"} />
                            <ReviewRow icon="mdi:currency-inr" label="Entry Fee" value={isPaid ? `${feeCurrency} ${feeAmount}` : "Free"} />
                        </div>

                        <div className={styles.reviewPublishNote}>
                            <Icon icon="mdi:rocket-launch-outline" width={14} height={14} />
                            {isEdit ? "Looks good? Save your changes." : "Looks good? Hit Publish to make it live."}
                        </div>
                    </div>
                )
        }
    }

    // ── Done state ────────────────────────────────────────────────
    if (phase === "done") {
        return (
            <div className={styles.backdrop} role="dialog" aria-modal="true">
                <div className={styles.modal}>
                    <div className={styles.doneState}>
                        <span className={styles.doneTick}><Icon icon="mdi:check-circle" width={52} height={52} /></span>
                        <span className={styles.doneLabel}>{isEdit ? "Changes Saved!" : draftSaved ? "Draft Saved!" : "Recruitment Published!"}</span>
                        <p className={styles.doneSubtitle}>{isEdit ? "Updating…" : "Redirecting…"}</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={styles.backdrop}
            onClick={e => { if (e.target === e.currentTarget && composing) requestClose() }}
            role="dialog"
            aria-modal="true"
            aria-label="Create recruitment"
        >
            <div className={styles.modal}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Avatar src={userAvatarUrl} initials={userInitials} size="sm" />
                        <div>
                            <h2 className={styles.headerTitle}>{isEdit ? "Edit Recruitment" : "Post Recruitment"}</h2>
                            <span className={styles.headerSub}>{displayName || username}</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={requestClose} disabled={isSubmitting} type="button" aria-label="Close">
                        <Icon icon="mdi:close" width={20} height={20} />
                    </button>
                </div>

                {/* Step bar */}
                <StepBar step={step} onStepClick={goToStep} disabled={isSubmitting} />

                {/* Body */}
                <div className={styles.body} ref={bodyRef}>
                    {renderStep()}

                    {phase === "uploading" && (
                        <div className={styles.uploadOverlay}>
                            <div className={styles.uploadOverlayInner}>
                                <Icon icon="mdi:cloud-upload-outline" width={28} height={28} />
                                <span>Uploading media…</span>
                                <div className={styles.uploadBarWrap}>
                                    <div className={styles.uploadBar} style={{ width: `${mediaEntries.length === 0 ? 100 : Math.round(mediaEntries.reduce((s, e) => s + e.progress, 0) / mediaEntries.length)}%` }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {phase === "posting" && (
                        <div className={styles.uploadOverlay}>
                            <div className={styles.uploadOverlayInner}>
                                <Icon icon="mdi:send-outline" width={28} height={28} />
                                <span>{isEdit ? "Saving changes…" : "Publishing…"}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <button className={styles.backBtn} onClick={step === 0 ? requestClose : goPrev} disabled={isSubmitting} type="button">
                        {step === 0 ? "Cancel" : <><Icon icon="mdi:chevron-left" width={16} height={16} /> Back</>}
                    </button>
                    <div className={styles.footerRight}>
                        <span className={styles.stepCounter}>{step + 1} / {TOTAL_STEPS}</span>
                        {isLastStep ? (
                            <>
                                {!isEdit && (
                                    <button className={styles.draftBtn} onClick={() => handleSubmit("draft")} disabled={isSubmitting} type="button">
                                        <Icon icon="mdi:content-save-edit-outline" width={15} height={15} />
                                        <span className={styles.btnLabelFull}>Save Draft</span>
                                        <span className={styles.btnLabelShort}>Draft</span>
                                    </button>
                                )}
                                <button
                                    className={styles.publishBtn}
                                    onClick={() => (isEdit ? handleSubmit() : handleSubmit("active"))}
                                    disabled={isSubmitting}
                                    type="button"
                                >
                                    <Icon icon={isEdit ? "mdi:content-save-outline" : "mdi:whistle-outline"} width={15} height={15} />
                                    <span className={styles.btnLabelFull}>{isEdit ? "Save Changes" : "Publish"}</span>
                                    <span className={styles.btnLabelShort}>{isEdit ? "Save" : "Submit"}</span>
                                </button>
                            </>
                        ) : (
                            <button className={styles.nextBtn} onClick={goNext} disabled={isSubmitting} type="button">
                                Next <Icon icon="mdi:chevron-right" width={16} height={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <input ref={fileInputRef} type="file" hidden multiple accept="image/*" onChange={handleFileChange} />

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
                            <button type="button" className={styles.confirmDiscardBtn} onClick={() => { setConfirmDiscard(false); onClose() }}>
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}