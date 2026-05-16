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
import { useCreateRecruitment } from "../../hooks/useRecruitments"

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

type MediaEntry = {
    id: string
    file: File
    preview: string
    progress: number
    status: "idle" | "uploading" | "done" | "error"
    error: string | null
    result: { file_url: string; public_id: string; media_type: "image" | "video"; order: number } | null
}

type PositionItem = { position_id: string; is_primary: boolean; name: string }
type SubmitPhase = "idle" | "uploading" | "posting" | "done"

const TOTAL_STEPS = 5
const STEP_LABELS = ["Basics", "Age & Venue", "Positions", "Media", "Review"]

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

function uid() { return Math.random().toString(36).slice(2, 10) }

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
}

export default function CreateRecruitmentModal({
    username,
    userAvatarUrl,
    userInitials,
    displayName,
    orgId,
    onClose,
    onCreated,
}: CreateRecruitmentModalProps) {
    // ── Step ─────────────────────────────────────────────────────
    const [step, setStep] = useState(0)

    // ── Step 0: Basics ────────────────────────────────────────────
    const [title, setTitle] = useState("")
    const [shortDesc, setShortDesc] = useState("")
    const [description, setDescription] = useState("")
    const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>("open_trial")
    const [visibility, setVisibility] = useState<RecruitmentVisibility>("public")
    const [sportId, setSportId] = useState("")
    const [gender, setGender] = useState<RecruitmentGender>("male")
    const [experienceLevel, setExperienceLevel] = useState("")
    const [applicationDeadline, setApplicationDeadline] = useState("")
    const [eventDate, setEventDate] = useState("")
    const [maxApplications, setMaxApplications] = useState("")

    // ── Step 1: Age + Venue ────────────────────────────────────────
    const [ageCategories, setAgeCategories] = useState<AgeCategoryDraft[]>([])
    const [venueName, setVenueName] = useState("")
    const [venueLink, setVenueLink] = useState("")
    const [location, setLocation] = useState<MapboxPlace | null>(null)
    const [locationOpen, setLocationOpen] = useState(false)

    // ── Step 2: Positions + Questions ────────────────────────────
    const [anyPosition, setAnyPosition] = useState(true)
    const [selectedPositions, setSelectedPositions] = useState<PositionItem[]>([])
    const [questions, setQuestions] = useState<QuestionDraft[]>([])
    const [benefits, setBenefits] = useState<BenefitDraft[]>([])
    const [requirements, setRequirements] = useState<RequirementDraft[]>([])
    const [contacts, setContacts] = useState<ContactDraft[]>([])

    // ── Step 3: Media + Payment ───────────────────────────────────
    const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([])
    const [isPaid, setIsPaid] = useState(false)
    const [feeAmount, setFeeAmount] = useState("")
    const [feeCurrency, setFeeCurrency] = useState("INR")
    const [paymentNote, setPaymentNote] = useState("")

    // ── Submission ────────────────────────────────────────────────
    const [phase, setPhase] = useState<SubmitPhase>("idle")
    const [submitError, setSubmitError] = useState<string | null>(null)

    const { mutateAsync: createRecruitment } = useCreateRecruitment()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isSubmitting = phase !== "idle"
    const composing = phase === "idle"

    // ── Scroll lock ───────────────────────────────────────────────
    useEffect(() => {
        const orig = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = orig }
    }, [])

    const { data: sports = [] } = useSportsList()
    const positions = sports.find(s => s.id === sportId)?.positions ?? []
    useEffect(() => { setSelectedPositions([]); setAnyPosition(true) }, [sportId])

    // ── Validation ────────────────────────────────────────────────
    const validateStep = (): string | null => {
        if (step === 0) {
            if (!title.trim() || title.trim().length < 5) return "Title must be at least 5 characters."
            if (!shortDesc.trim() || shortDesc.trim().length < 10) return "Short description must be at least 10 characters."
            if (!sportId) return "Please select a sport."
            if (!eventDate) return "Please set an event / trial date."
        }
        if (step === 1) {
            for (const cat of ageCategories) {
                if (!cat.title.trim()) return "All age categories need a title."
                if (cat.min_birth_year > cat.max_birth_year) return `"${cat.title}": min birth year cannot exceed max birth year.`
                if (cat.min_birth_year < 1980 || cat.max_birth_year > CURRENT_YEAR) return `"${cat.title}": birth years must be between 1980 and ${CURRENT_YEAR}.`
            }
        }
        if (step === 2) {
            for (const q of questions) {
                if (!q.question.trim()) return "All questions must have text."
                const hasOptions = ["radio", "select", "checkbox"].includes(q.field_type)
                if (hasOptions && q.options.filter(o => o.value.trim()).length < 2) return `Question "${q.question || "untitled"}" needs at least 2 options.`
            }
            for (const c of contacts) {
                if (!c.value.trim()) return "All contacts need a value (phone or email)."
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
        setStep(s => Math.min(TOTAL_STEPS - 1, s + 1))
    }

    const goPrev = () => {
        setSubmitError(null)
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
            if (e) URL.revokeObjectURL(e.preview)
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

    // ── Submit ────────────────────────────────────────────────────
    const handleSubmit = async () => {
        const err = validateStep()
        if (err) { setSubmitError(err); return }
        setSubmitError(null)

        let uploadedMedia: { file_url: string; public_id: string; media_type: "image" | "video"; order: number }[] = []

        if (mediaEntries.length > 0) {
            setPhase("uploading")
            setMediaEntries(prev => prev.map(e => ({ ...e, status: "uploading", progress: 0 })))
            try {
                const sigRes = await getUploadSignatureApi("recruitments", mediaEntries.length, orgId)
                const uploads = sigRes.uploads
                for (let i = 0; i < mediaEntries.length; i++) {
                    const entry = mediaEntries[i]
                    const sig = uploads[i]
                    try {
                        const result = await uploadToCloudinaryApi(entry.file, sig)
                        setMediaEntries(prev => prev.map((e, idx) =>
                            idx === i ? { ...e, status: "done", progress: 100, result: { file_url: result.secure_url, public_id: result.public_id, media_type: "image", order: i } } : e
                        ))
                        uploadedMedia.push({ file_url: result.secure_url, public_id: result.public_id, media_type: "image", order: i })
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Upload failed"
                        setMediaEntries(prev => prev.map((e, idx) => idx === i ? { ...e, status: "error", error: msg } : e))
                        throw new Error(msg)
                    }
                }
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "Upload failed")
                setPhase("idle")
                return
            }
        }

        setPhase("posting")

        try {
            const res = await createRecruitment({
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
                media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
            } as any)

            setPhase("done")
            setTimeout(() => {
                onCreated?.(res.recruitment_id)
                onClose()
            }, 2000)
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Failed to create recruitment.")
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
                            <input className={styles.fieldInput} placeholder="e.g. U17 Open Football Trials" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} disabled={isSubmitting} />
                            <span className={styles.fieldHint}>{title.length}/120</span>
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
                                <select className={styles.fieldSelect} value={sportId} onChange={e => setSportId(e.target.value)} disabled={isSubmitting}>
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
                                <input className={styles.fieldInput} type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Application Deadline</label>
                                <input className={styles.fieldInput} type="datetime-local" value={applicationDeadline} onChange={e => setApplicationDeadline(e.target.value)} disabled={isSubmitting} />
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

                        {/* Contacts */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Contact Info
                                <span className={styles.fieldLabelMuted}> — optional</span>
                            </label>
                            <ContactsBuilder contacts={contacts} onChange={setContacts} disabled={isSubmitting} />
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
                                            <input className={styles.fieldInput} type="number" min={0} step="0.01" placeholder="e.g. 300" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} disabled={isSubmitting} />
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
                            <span>Review before publishing</span>
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
                            Looks good? Hit Publish to make it live.
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
                        <span className={styles.doneLabel}>Recruitment Created!</span>
                        <p className={styles.doneSubtitle}>Redirecting…</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={styles.backdrop}
            onClick={e => { if (e.target === e.currentTarget && composing) onClose() }}
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
                            <h2 className={styles.headerTitle}>Post Recruitment</h2>
                            <span className={styles.headerSub}>{displayName || username}</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} disabled={isSubmitting} type="button" aria-label="Close">
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
                                <span>Publishing…</span>
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
                    <button className={styles.backBtn} onClick={step === 0 ? onClose : goPrev} disabled={isSubmitting} type="button">
                        {step === 0 ? "Cancel" : <><Icon icon="mdi:chevron-left" width={16} height={16} /> Back</>}
                    </button>
                    <div className={styles.footerRight}>
                        <span className={styles.stepCounter}>{step + 1} / {TOTAL_STEPS}</span>
                        {isLastStep ? (
                            <button className={styles.publishBtn} onClick={handleSubmit} disabled={isSubmitting} type="button">
                                <Icon icon="mdi:whistle-outline" width={15} height={15} />
                                Publish
                            </button>
                        ) : (
                            <button className={styles.nextBtn} onClick={goNext} disabled={isSubmitting} type="button">
                                Next <Icon icon="mdi:chevron-right" width={16} height={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <input ref={fileInputRef} type="file" hidden multiple accept="image/*" onChange={handleFileChange} />
        </div>
    )
}