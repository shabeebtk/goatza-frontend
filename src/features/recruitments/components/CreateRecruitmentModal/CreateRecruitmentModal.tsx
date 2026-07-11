"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "@/features/posts/components/PostLocationPicker/PostLocationPicker"
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

type AgeCategoryDraft = {
    id: string
    title: string
    min_birth_year: number
    max_birth_year: number
    reporting_time: string      // "HH:MM" or ""
    showReportingTime: boolean
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
    file: File | null            // null for already-uploaded (existing) media
    preview: string
    progress: number
    status: "idle" | "uploading" | "done" | "error"
    error: string | null
    result: UploadedMedia | null
    existing?: boolean           // true → already on the server, skip the upload pipeline
}

type PositionItem = { position_id: string; is_primary: boolean; name: string }
type SubmitPhase = "idle" | "uploading" | "posting" | "done"

const TOTAL_STEPS = 5
const STEP_LABELS = ["Basics", "Age & Venue", "Positions", "Media", "Review"]

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
    { value: "travel", label: "Travel", icon: "mdi:airplane-outline" },
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

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Edit mode: map server detail shapes → wizard draft shapes ──

function isoToLocalInput(iso: string | null): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function reportingTimeToDraft(t: string | null): { value: string; show: boolean } {
    if (!t) return { value: "", show: false }
    // "HH:MM:SS" → "HH:MM"
    const [h = "", m = ""] = t.split(":")
    return { value: `${h}:${m}`, show: true }
}

function mapInitialAgeCategories(r: RecruitmentDetail): AgeCategoryDraft[] {
    return (r.age_categories ?? []).map((c, idx) => {
        const rt = reportingTimeToDraft(c.reporting_time)
        return {
            id: uid(),
            title: c.title,
            min_birth_year: c.min_birth_year,
            max_birth_year: c.max_birth_year,
            reporting_time: rt.value,
            showReportingTime: rt.show,
            display_order: idx,
        }
    })
}

function mapInitialQuestions(r: RecruitmentDetail): QuestionDraft[] {
    return (r.questions ?? []).map((q) => ({
        id: uid(),
        question: q.question,
        field_type: q.field_type,
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
            is_primary: p.is_primary,
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

function StepBar({ step }: { step: number }) {
    return (
        <div className={styles.stepBar}>
            {STEP_LABELS.map((label, i) => (
                <div key={i} className={`${styles.stepItem} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}>
                    <div className={styles.stepDot}>
                        {i < step ? <Icon icon="mdi:check" width={10} height={10} /> : <span>{i + 1}</span>}
                    </div>
                    <span className={styles.stepLabel}>{label}</span>
                    {i < STEP_LABELS.length - 1 && <div className={styles.stepLine} />}
                </div>
            ))}
        </div>
    )
}

// ── Age Category Builder ──────────────────────────────────────

function AgeCategoryBuilder({ categories, onChange, disabled }: {
    categories: AgeCategoryDraft[]
    onChange: (cats: AgeCategoryDraft[]) => void
    disabled: boolean
}) {
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

    const update = (id: string, patch: Partial<AgeCategoryDraft>) => {
        onChange(categories.map(c => c.id === id ? { ...c, ...patch } : c))
    }

    const remove = (id: string) => onChange(categories.filter(c => c.id !== id))

    const activePresets = new Set(categories.map(c => c.title))

    return (
        <div className={styles.ageCategoryBuilder}>
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
                    {categories.map((cat, i) => (
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
                                    <label className={styles.fieldLabel}>Min Birth Year</label>
                                    <input
                                        className={styles.fieldInput}
                                        type="number"
                                        min={1980}
                                        max={CURRENT_YEAR}
                                        value={cat.min_birth_year}
                                        onChange={e => update(cat.id, { min_birth_year: Number(e.target.value) })}
                                        disabled={disabled}
                                    />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Max Birth Year</label>
                                    <input
                                        className={styles.fieldInput}
                                        type="number"
                                        min={1980}
                                        max={CURRENT_YEAR}
                                        value={cat.max_birth_year}
                                        onChange={e => update(cat.id, { max_birth_year: Number(e.target.value) })}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>

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
                    Select preset age groups above or add a custom category.
                </p>
            )}
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

    return (
        <div className={styles.listBuilder}>
            {benefits.map((b) => {
                const iconEntry = BENEFIT_ICONS.find(ic => ic.value === b.icon_name) ?? BENEFIT_ICONS[0]
                return (
                    <div key={b.id} className={styles.listBuilderRow}>
                        <select
                            className={styles.iconSelect}
                            value={b.icon_name}
                            onChange={e => update(b.id, { icon_name: e.target.value })}
                            disabled={disabled}
                        >
                            {BENEFIT_ICONS.map(ic => <option key={ic.value} value={ic.value}>{ic.label}</option>)}
                        </select>
                        <Icon icon={iconEntry.icon} width={16} height={16} className={styles.listBuilderIcon} />
                        <input
                            className={`${styles.fieldInput} ${styles.listBuilderInput}`}
                            placeholder="e.g. Professional Coaching"
                            value={b.title}
                            onChange={e => update(b.id, { title: e.target.value })}
                            disabled={disabled}
                            maxLength={80}
                        />
                        <button className={styles.removeQBtn} onClick={() => remove(b.id)} type="button" disabled={disabled}>
                            <Icon icon="mdi:close" width={13} height={13} />
                        </button>
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
    const FIELD_TYPES: { value: QuestionFieldType; label: string }[] = [
        { value: "short_text", label: "Short Text" }, { value: "long_text", label: "Long Text" },
        { value: "radio", label: "Radio" }, { value: "select", label: "Select" },
        { value: "checkbox", label: "Checkbox" }, { value: "number", label: "Number" },
    ]
    const HAS_OPTIONS: QuestionFieldType[] = ["radio", "select", "checkbox"]

    return (
        <div className={styles.questionBuilder}>
            {questions.map((q, i) => (
                <div key={q.id} className={styles.questionCard}>
                    <div className={styles.questionCardHeader}>
                        <span className={styles.questionNum}>Q{i + 1}</span>
                        <select className={styles.fieldTypeSelect} value={q.field_type} onChange={e => updateQ(q.id, { field_type: e.target.value as QuestionFieldType })} disabled={disabled}>
                            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                        </select>
                        <label className={styles.requiredToggle}>
                            <input type="checkbox" checked={q.is_required} onChange={e => updateQ(q.id, { is_required: e.target.checked })} disabled={disabled} />
                            <span>Required</span>
                        </label>
                        {!disabled && <button className={styles.removeQBtn} onClick={() => removeQ(q.id)} type="button"><Icon icon="mdi:close" width={14} height={14} /></button>}
                    </div>
                    <input className={styles.qInput} placeholder="Question text…" value={q.question} onChange={e => updateQ(q.id, { question: e.target.value })} disabled={disabled} />
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

function MediaPreview({ entries, onRemove, disabled }: {
    entries: MediaEntry[]
    onRemove: (id: string) => void
    disabled: boolean
}) {
    const [idx, setIdx] = useState(0)
    useEffect(() => {
        if (idx >= entries.length && entries.length > 0) setIdx(entries.length - 1)
    }, [entries.length, idx])

    if (entries.length === 0) return null
    const total = entries.length
    const cur = entries[idx]

    return (
        <div className={styles.previewCarousel}>
            <div className={styles.previewSlide}>
                <img src={cur.preview} className={styles.previewMedia} alt={`Media ${idx + 1}`} />
                {cur.status === "uploading" && <div className={styles.previewOverlay}><span className={styles.uploadPct}>{cur.progress}%</span></div>}
                {cur.status === "done" && <div className={styles.previewOverlay}><Icon icon="mdi:check-circle" width={28} height={28} style={{ color: "var(--color-brand)" }} /></div>}
                {cur.status === "error" && <div className={styles.previewOverlayErr}><Icon icon="mdi:alert-circle" width={20} height={20} /><span>{cur.error}</span></div>}
                {!disabled && <button className={styles.previewRemoveBtn} onClick={() => { onRemove(cur.id); if (idx > 0 && idx === total - 1) setIdx(idx - 1) }} type="button"><Icon icon="mdi:close" width={13} height={13} /></button>}
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

    // ── Step 1: Age + Venue ────────────────────────────────────────
    const [ageCategories, setAgeCategories] = useState<AgeCategoryDraft[]>(() => (init ? mapInitialAgeCategories(init) : []))
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
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [draftSaved, setDraftSaved] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)

    const toast = useToast()
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
        ageCategories: ageCategories.map(({ id: _id, ...c }) => c),
        venueName, venueLink,
        location: location ? { name: location.name, lat: location.latitude, lng: location.longitude } : null,
        anyPosition,
        selectedPositions: selectedPositions.map(p => ({ position_id: p.position_id, is_primary: p.is_primary })),
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

    // ── Validation ────────────────────────────────────────────────
    const validateStep = (): string | null => {
        if (step === 0) {
            if (!title.trim() || title.trim().length < 5) return "Title must be at least 5 characters."
            if (!shortDesc.trim() || shortDesc.trim().length < 10) return "Short description must be at least 10 characters."
            if (!sportId) return "Please select a sport."
            if (!eventDate) return "Please set an event / trial date."

            // deadline must be on or before the event date
            if (applicationDeadline && eventDate && new Date(applicationDeadline) > new Date(eventDate)) {
                return "Application deadline must be on or before the event date."
            }
            // deadline not in the past — but in edit mode, an unchanged past deadline is fine
            if (applicationDeadline) {
                const initialDeadlineLocal = isoToLocalInput(init?.application_deadline ?? null)
                const deadlineChanged = applicationDeadline !== initialDeadlineLocal
                if ((!isEdit || deadlineChanged) && new Date(applicationDeadline).getTime() < Date.now()) {
                    return "Application deadline cannot be in the past."
                }
            }
        }
        if (step === 1) {
            for (const cat of ageCategories) {
                if (!cat.title.trim()) return "All age categories need a title."
                if (cat.min_birth_year > cat.max_birth_year) return `"${cat.title}": min birth year cannot exceed max birth year.`
                if (cat.min_birth_year < 1980 || cat.max_birth_year > CURRENT_YEAR) return `"${cat.title}": birth years must be between 1980 and ${CURRENT_YEAR}.`
            }
            if (venueLink.trim() && !isValidHttpUrl(venueLink.trim())) {
                return "Enter a valid venue map URL (including https://)."
            }
        }
        if (step === 2) {
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
        if (step === 3) {
            if (isPaid && !feeAmount) return "Enter the fee amount."
        }
        return null
    }

    const goNext = () => {
        const err = validateStep()
        if (err) { setSubmitError(err); return }
        setSubmitError(null)
        setFieldErrors({})
        setStep(s => Math.min(TOTAL_STEPS - 1, s + 1))
    }

    const goPrev = () => {
        setSubmitError(null)
        setFieldErrors({})
        setStep(s => Math.max(0, s - 1))
    }

    // ── Media ─────────────────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ""
        if (!files.length) return
        setSubmitError(null)
        const imageFiles = files.filter(f => f.type.startsWith("image/"))
        const newEntries: MediaEntry[] = imageFiles.slice(0, 5 - mediaEntries.length).map(f => ({
            id: uid(), file: f, preview: URL.createObjectURL(f),
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

    // ── Position toggle ───────────────────────────────────────────
    const togglePosition = (id: string, name: string) => {
        setSelectedPositions(prev => {
            const exists = prev.find(p => p.position_id === id)
            if (exists) return prev.filter(p => p.position_id !== id)
            return [...prev, { position_id: id, name, is_primary: prev.length === 0 }]
        })
    }
    const setPrimary = (id: string) => {
        setSelectedPositions(prev => prev.map(p => ({ ...p, is_primary: p.position_id === id })))
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
        application_deadline: applicationDeadline ? new Date(applicationDeadline).toISOString() : undefined,
        event_date: eventDate ? new Date(eventDate).toISOString() : undefined,
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
            name: location.name,
            city: location.place_type === "place" ? location.name : undefined,
            country_code: location.country_code,
            latitude: location.latitude,
            longitude: location.longitude,
        } : undefined,
        // send [] if "Any" is selected, otherwise the selected list
        positions: anyPosition
            ? []
            : selectedPositions.map(p => ({ position_id: p.position_id, is_primary: p.is_primary })),
        age_categories: ageCategories.map((c, idx) => ({
            title: c.title.trim(),
            min_birth_year: c.min_birth_year,
            max_birth_year: c.max_birth_year,
            reporting_time: c.showReportingTime && c.reporting_time ? c.reporting_time + ":00" : undefined,
            display_order: idx,
        })),
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
        const err = validateStep()
        if (err) { setSubmitError(err); return }
        setSubmitError(null)
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
                        const result = await uploadToCloudinaryApi(file, sig)
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
                setSubmitError(msg)
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
            setSubmitError(msg)
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
                            <label className={styles.fieldLabel}>Short Description <span className={styles.required}>*</span></label>
                            <input className={styles.fieldInput} placeholder="Brief tagline shown on the card" value={shortDesc} onChange={e => setShortDesc(e.target.value)} maxLength={200} disabled={isSubmitting} />
                            <span className={styles.fieldHint}>{shortDesc.length}/200</span>
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

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Gender</label>
                                <select className={styles.fieldSelect} value={gender} onChange={e => setGender(e.target.value as RecruitmentGender)} disabled={isSubmitting}>
                                    <option value="all">All</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
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
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Trial / Event Date <span className={styles.required}>*</span></label>
                                <input className={styles.fieldInput} type="datetime-local" value={eventDate} onChange={e => { setEventDate(e.target.value); clearFieldError("event_date") }} disabled={isSubmitting} />
                                {renderFieldError("event_date")}
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Application Deadline</label>
                                <input className={styles.fieldInput} type="datetime-local" value={applicationDeadline} onChange={e => { setApplicationDeadline(e.target.value); clearFieldError("application_deadline") }} disabled={isSubmitting} />
                                {renderFieldError("application_deadline")}
                            </div>
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Max Applications</label>
                                <input className={styles.fieldInput} type="number" min={1} placeholder="e.g. 300 (leave blank for unlimited)" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} disabled={isSubmitting} />
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
                    </div>
                )

            // ── Step 1: Age Categories + Venue ────────────────────────
            case 1:
                return (
                    <div className={styles.stepContent}>
                        {/* Age categories */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Age Categories</label>
                            <p className={styles.fieldSubLabel}>Select preset groups or add custom categories with birth year ranges.</p>
                            <AgeCategoryBuilder categories={ageCategories} onChange={setAgeCategories} disabled={isSubmitting} />
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
                            {locationOpen && !location && (
                                <div className={styles.locationPickerWrap}>
                                    <PostLocationPicker
                                        value={location}
                                        onChange={(place) => { setLocation(place); if (place) setLocationOpen(false) }}
                                        disabled={isSubmitting}
                                    />
                                </div>
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
                                                {sel && !anyPosition && (
                                                    <button
                                                        className={`${styles.positionPrimaryBtn} ${sel.is_primary ? styles.positionPrimaryBtnActive : ""}`}
                                                        onClick={() => setPrimary(p.id)}
                                                        type="button"
                                                        title="Set as primary"
                                                        disabled={isSubmitting}
                                                    >
                                                        {sel.is_primary ? "PRIMARY" : "SET PRIMARY"}
                                                    </button>
                                                )}
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
                                    <p className={styles.fieldSubLabel}>Players are sent here to apply.</p>
                                </div>
                            )}
                            {applyMethod === "goatza" && (
                                <p className={styles.fieldSubLabel}>Players apply in-app through Goatza.</p>
                            )}
                            {applyMethod === "contact" && (
                                <p className={styles.fieldSubLabel}>Players reach out using the contacts below.</p>
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
                            <MediaPreview entries={mediaEntries} onRemove={removeMedia} disabled={isSubmitting} />
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
                            <ReviewRow icon="mdi:gender-male-female" label="Gender" value={gender} />
                            <ReviewRow icon="mdi:calendar" label="Event Date" value={eventDate ? new Date(eventDate).toLocaleString() : null} />
                            <ReviewRow icon="mdi:calendar-clock" label="Deadline" value={applicationDeadline ? new Date(applicationDeadline).toLocaleString() : null} />
                        </div>

                        {ageCategories.length > 0 && (
                            <div className={styles.reviewSection}>
                                <p className={styles.reviewSectionTitle}>Age Categories ({ageCategories.length})</p>
                                {ageCategories.map(c => (
                                    <ReviewRow
                                        key={c.id}
                                        icon="mdi:account-group-outline"
                                        label={c.title}
                                        value={`Born ${c.min_birth_year}–${c.max_birth_year}${c.showReportingTime && c.reporting_time ? ` · Reporting ${c.reporting_time}` : ""}`}
                                    />
                                ))}
                            </div>
                        )}

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
                <StepBar step={step} />

                {/* Body */}
                <div className={styles.body}>
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

                    {submitError && (
                        <p className={styles.submitError} role="alert">
                            <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                            {submitError}
                        </p>
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
                                        Save Draft
                                    </button>
                                )}
                                <button
                                    className={styles.publishBtn}
                                    onClick={() => (isEdit ? handleSubmit() : handleSubmit("active"))}
                                    disabled={isSubmitting}
                                    type="button"
                                >
                                    <Icon icon={isEdit ? "mdi:content-save-outline" : "mdi:whistle-outline"} width={15} height={15} />
                                    {isEdit ? "Save Changes" : "Publish"}
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