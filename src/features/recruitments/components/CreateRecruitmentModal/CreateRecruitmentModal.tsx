"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "@/features/posts/components/PostLocationPicker/PostLocationPicker"
import {
    getUploadSignatureApi,
    uploadToCloudinaryApi,
} from "@/features/profile/services/upload.api"
import type { MapboxPlace } from "@/shared/services/mapbox.service"
import api from "@/core/api/axios"
import styles from "./CreateRecruitmentModal.module.css"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"

// ── Types ─────────────────────────────────────────────────────

export type RecruitmentType =
    | "open_trial"
    | "player_looking"
    | "direct_recruitment"
    | "scholarship"

export type RecruitmentVisibility = "public" | "followers_only" | "private"
export type RecruitmentGender = "male" | "female" | "all"
export type QuestionFieldType =
    | "short_text"
    | "long_text"
    | "select"
    | "radio"
    | "checkbox"
    | "number"

type QuestionDraft = {
    id: string
    question: string
    field_type: QuestionFieldType
    is_required: boolean
    options: { value: string }[]
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
type SportItem = { id: string; name: string }

type SubmitPhase = "idle" | "uploading" | "posting" | "done"

// Steps: 0=Basic, 1=Details, 2=Location, 3=Positions/Questions, 4=Media+Payment
const TOTAL_STEPS = 5

function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Step indicator ────────────────────────────────────────────

const STEP_LABELS = ["Basics", "Details", "Location", "Questions", "Media"]

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

// ── Badge Select ──────────────────────────────────────────────

function BadgeSelect<T extends string>({
    value,
    onChange,
    options,
    icon,
    disabled,
}: {
    value: T
    onChange: (v: T) => void
    options: { value: T; label: string }[]
    icon: string
    disabled?: boolean
}) {
    return (
        <div className={styles.badgeSelectWrap}>
            <Icon icon={icon} width={12} height={12} className={styles.badgeSelectIcon} />
            <select
                className={styles.badgeSelect}
                value={value}
                onChange={e => onChange(e.target.value as T)}
                disabled={disabled}
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    )
}

// ── Media carousel ─────────────────────────────────────────────

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

                {cur.status === "uploading" && (
                    <div className={styles.previewOverlay}>
                        <span className={styles.uploadPct}>{cur.progress}%</span>
                    </div>
                )}
                {cur.status === "done" && (
                    <div className={styles.previewOverlay}>
                        <Icon icon="mdi:check-circle" width={28} height={28} style={{ color: "var(--color-brand)" }} />
                    </div>
                )}
                {cur.status === "error" && (
                    <div className={styles.previewOverlayErr}>
                        <Icon icon="mdi:alert-circle" width={20} height={20} />
                        <span>{cur.error}</span>
                    </div>
                )}

                {!disabled && (
                    <button className={styles.previewRemoveBtn} onClick={() => { onRemove(cur.id); if (idx > 0 && idx === total - 1) setIdx(idx - 1) }} type="button">
                        <Icon icon="mdi:close" width={13} height={13} />
                    </button>
                )}
                {total > 1 && <div className={styles.previewCounter}>{idx + 1}/{total}</div>}
                {total > 1 && idx > 0 && (
                    <button className={`${styles.previewNav} ${styles.previewNavPrev}`} onClick={() => setIdx(i => Math.max(0, i - 1))} type="button">
                        <Icon icon="mdi:chevron-left" width={18} height={18} />
                    </button>
                )}
                {total > 1 && idx < total - 1 && (
                    <button className={`${styles.previewNav} ${styles.previewNavNext}`} onClick={() => setIdx(i => Math.min(total - 1, i + 1))} type="button">
                        <Icon icon="mdi:chevron-right" width={18} height={18} />
                    </button>
                )}
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

// ── Question builder ──────────────────────────────────────────

function QuestionBuilder({ questions, onChange, disabled }: {
    questions: QuestionDraft[]
    onChange: (qs: QuestionDraft[]) => void
    disabled: boolean
}) {
    const addQuestion = () => {
        onChange([...questions, {
            id: uid(),
            question: "",
            field_type: "short_text",
            is_required: false,
            options: [],
        }])
    }

    const updateQ = (id: string, patch: Partial<QuestionDraft>) => {
        onChange(questions.map(q => q.id === id ? { ...q, ...patch } : q))
    }

    const removeQ = (id: string) => onChange(questions.filter(q => q.id !== id))

    const addOption = (id: string) => {
        onChange(questions.map(q => q.id === id ? { ...q, options: [...q.options, { value: "" }] } : q))
    }

    const updateOption = (qid: string, oi: number, val: string) => {
        onChange(questions.map(q => q.id === qid
            ? { ...q, options: q.options.map((o, i) => i === oi ? { value: val } : o) }
            : q
        ))
    }

    const removeOption = (qid: string, oi: number) => {
        onChange(questions.map(q => q.id === qid
            ? { ...q, options: q.options.filter((_, i) => i !== oi) }
            : q
        ))
    }

    const FIELD_TYPES: { value: QuestionFieldType; label: string }[] = [
        { value: "short_text", label: "Short Text" },
        { value: "long_text", label: "Long Text" },
        { value: "radio", label: "Radio" },
        { value: "select", label: "Select" },
        { value: "checkbox", label: "Checkbox" },
        { value: "number", label: "Number" },
    ]

    const HAS_OPTIONS: QuestionFieldType[] = ["radio", "select", "checkbox"]

    return (
        <div className={styles.questionBuilder}>
            {questions.map((q, i) => (
                <div key={q.id} className={styles.questionCard}>
                    <div className={styles.questionCardHeader}>
                        <span className={styles.questionNum}>Q{i + 1}</span>
                        <select
                            className={styles.fieldTypeSelect}
                            value={q.field_type}
                            onChange={e => updateQ(q.id, { field_type: e.target.value as QuestionFieldType })}
                            disabled={disabled}
                        >
                            {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                        </select>
                        <label className={styles.requiredToggle}>
                            <input
                                type="checkbox"
                                checked={q.is_required}
                                onChange={e => updateQ(q.id, { is_required: e.target.checked })}
                                disabled={disabled}
                            />
                            <span>Required</span>
                        </label>
                        {!disabled && (
                            <button className={styles.removeQBtn} onClick={() => removeQ(q.id)} type="button">
                                <Icon icon="mdi:close" width={14} height={14} />
                            </button>
                        )}
                    </div>
                    <input
                        className={styles.qInput}
                        placeholder="Question text…"
                        value={q.question}
                        onChange={e => updateQ(q.id, { question: e.target.value })}
                        disabled={disabled}
                    />
                    {HAS_OPTIONS.includes(q.field_type) && (
                        <div className={styles.optionsList}>
                            {q.options.map((o, oi) => (
                                <div key={oi} className={styles.optionRow}>
                                    <input
                                        className={styles.optionInput}
                                        placeholder={`Option ${oi + 1}`}
                                        value={o.value}
                                        onChange={e => updateOption(q.id, oi, e.target.value)}
                                        disabled={disabled}
                                    />
                                    {!disabled && (
                                        <button className={styles.removeOptBtn} onClick={() => removeOption(q.id, oi)} type="button">
                                            <Icon icon="mdi:close" width={11} height={11} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {!disabled && (
                                <button className={styles.addOptionBtn} onClick={() => addOption(q.id)} type="button">
                                    <Icon icon="mdi:plus" width={13} height={13} />
                                    Add Option
                                </button>
                            )}
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
    const router = useRouter()

    // ── Step ──────────────────────────────────────────────────────
    const [step, setStep] = useState(0)

    // ── Step 0: Basics ────────────────────────────────────────────
    const [title, setTitle] = useState("")
    const [shortDesc, setShortDesc] = useState("")
    const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>("open_trial")
    const [visibility, setVisibility] = useState<RecruitmentVisibility>("public")
    const [sportId, setSportId] = useState("")

    // ── Step 1: Details ───────────────────────────────────────────
    const [description, setDescription] = useState("")
    const [gender, setGender] = useState<RecruitmentGender>("all")
    const [minAge, setMinAge] = useState("")
    const [maxAge, setMaxAge] = useState("")
    const [experienceLevel, setExperienceLevel] = useState("")
    const [applicationDeadline, setApplicationDeadline] = useState("")
    const [eventDate, setEventDate] = useState("")
    const [maxApplications, setMaxApplications] = useState("")

    // ── Step 2: Location ──────────────────────────────────────────
    const [location, setLocation] = useState<MapboxPlace | null>(null)
    const [locationOpen, setLocationOpen] = useState(false)

    // ── Step 3: Positions + Questions ────────────────────────────
    const [selectedPositions, setSelectedPositions] = useState<PositionItem[]>([])
    const [questions, setQuestions] = useState<QuestionDraft[]>([])

    // ── Step 4: Media + Payment ───────────────────────────────────
    const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([])
    const [isPaid, setIsPaid] = useState(false)
    const [feeAmount, setFeeAmount] = useState("")
    const [feeCurrency, setFeeCurrency] = useState("INR")
    const [paymentNote, setPaymentNote] = useState("")

    // ── Submission ────────────────────────────────────────────────
    const [phase, setPhase] = useState<SubmitPhase>("idle")
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [createdId, setCreatedId] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const isSubmitting = phase !== "idle"
    const composing = phase === "idle"

    // ── Scroll lock ───────────────────────────────────────────────
    useEffect(() => {
        const orig = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = orig }
    }, [])

    // ── Done effect ───────────────────────────────────────────────
    useEffect(() => {
        if (phase === "done" && createdId) {
            const t = setTimeout(() => {
                onCreated?.(createdId)
                onClose()
            }, 2000)
            return () => clearTimeout(t)
        }
    }, [phase, createdId, onCreated, onClose])

    const { data: sports = [] } = useSportsList()
    const positions = sports.find(s => s.id === sportId)?.positions ?? []
    useEffect(() => {
        setSelectedPositions([])
    }, [sportId])

    // ── Validation per step ───────────────────────────────────────
    const validateStep = (): string | null => {
        if (step === 0) {
            if (!title.trim() || title.trim().length < 5) return "Title must be at least 5 characters."
            if (!shortDesc.trim() || shortDesc.trim().length < 10) return "Short description must be at least 10 characters."
            if (!sportId) return "Please select a sport."
        }
        if (step === 1) {
            if (minAge && maxAge && Number(minAge) > Number(maxAge)) return "Min age cannot exceed max age."
        }
        if (step === 3) {
            for (const q of questions) {
                if (!q.question.trim()) return "All questions must have text."
                const hasOptions = ["radio", "select", "checkbox"].includes(q.field_type)
                if (hasOptions && q.options.filter(o => o.value.trim()).length < 2) {
                    return `Question "${q.question || "untitled"}" needs at least 2 options.`
                }
            }
        }
        if (step === 4) {
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

    // ── Media file pick ───────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ""
        if (!files.length) return
        setSubmitError(null)
        const imageFiles = files.filter(f => f.type.startsWith("image/"))
        const newEntries: MediaEntry[] = imageFiles.slice(0, 5 - mediaEntries.length).map(f => ({
            id: uid(),
            file: f,
            preview: URL.createObjectURL(f),
            progress: 0,
            status: "idle",
            error: null,
            result: null,
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

        // Upload media if any
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
                const msg = err instanceof Error ? err.message : "Upload failed"
                setSubmitError(msg)
                setPhase("idle")
                return
            }
        }

        setPhase("posting")

        try {
            const payload: Record<string, unknown> = {
                title: title.trim(),
                short_description: shortDesc.trim(),
                description: description.trim() || undefined,
                recruitment_type: recruitmentType,
                visibility,
                gender: gender === "all" ? "all" : gender,
                sport_id: sportId,
                min_age: minAge ? Number(minAge) : undefined,
                max_age: maxAge ? Number(maxAge) : undefined,
                experience_level: experienceLevel || undefined,
                application_deadline: applicationDeadline ? new Date(applicationDeadline).toISOString() : undefined,
                event_date: eventDate ? new Date(eventDate).toISOString() : undefined,
                max_applications: maxApplications ? Number(maxApplications) : undefined,
                is_paid: isPaid,
                fee_amount: isPaid && feeAmount ? feeAmount : undefined,
                fee_currency: isPaid ? feeCurrency : undefined,
                payment_note: isPaid && paymentNote ? paymentNote : undefined,
                location: location ? {
                    name: location.name,
                    city: location.place_type === "place" ? location.name : undefined,
                    country_code: location.country_code,
                    latitude: location.latitude,
                    longitude: location.longitude,
                } : undefined,
                positions: selectedPositions.map(p => ({ position_id: p.position_id, is_primary: p.is_primary })),
                questions: questions
                    .filter(q => q.question.trim())
                    .map(q => ({
                        question: q.question.trim(),
                        field_type: q.field_type,
                        is_required: q.is_required,
                        options: q.options.filter(o => o.value.trim()).map(o => ({ value: o.value.trim() })),
                    })),
                media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
            }

            const res = await api.post("/recruitments/create", payload)
            const { recruitment_id } = res.data.data
            setCreatedId(recruitment_id)
            setPhase("done")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to create recruitment."
            setSubmitError(msg)
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
                            <label className={styles.fieldLabel}>
                                Recruitment Title <span className={styles.required}>*</span>
                            </label>
                            <input
                                className={styles.fieldInput}
                                placeholder="e.g. U17 Open Football Trials"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                maxLength={120}
                                disabled={isSubmitting}
                            />
                            <span className={styles.fieldHint}>{title.length}/120</span>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Short Description <span className={styles.required}>*</span>
                            </label>
                            <input
                                className={styles.fieldInput}
                                placeholder="Brief tagline shown on the card"
                                value={shortDesc}
                                onChange={e => setShortDesc(e.target.value)}
                                maxLength={200}
                                disabled={isSubmitting}
                            />
                            <span className={styles.fieldHint}>{shortDesc.length}/200</span>
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
                                <label className={styles.fieldLabel}>Visibility</label>
                                <select className={styles.fieldSelect} value={visibility} onChange={e => setVisibility(e.target.value as RecruitmentVisibility)} disabled={isSubmitting}>
                                    <option value="public">Public</option>
                                    <option value="followers_only">Followers Only</option>
                                    <option value="private">Private</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Sport <span className={styles.required}>*</span></label>
                            <select className={styles.fieldSelect} value={sportId} onChange={e => setSportId(e.target.value)} disabled={isSubmitting}>
                                <option value="">— Select sport —</option>
                                {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>
                )

            // ── Step 1: Details ───────────────────────────────────────
            case 1:
                return (
                    <div className={styles.stepContent}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Full Description</label>
                            <textarea
                                className={styles.fieldTextarea}
                                placeholder="Describe the trial, requirements, what to bring…"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={4}
                                maxLength={3000}
                                disabled={isSubmitting}
                            />
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
                                <label className={styles.fieldLabel}>Min Age</label>
                                <input className={styles.fieldInput} type="number" min={5} max={99} placeholder="e.g. 15" value={minAge} onChange={e => setMinAge(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Max Age</label>
                                <input className={styles.fieldInput} type="number" min={5} max={99} placeholder="e.g. 18" value={maxAge} onChange={e => setMaxAge(e.target.value)} disabled={isSubmitting} />
                            </div>
                        </div>

                        <div className={styles.fieldRow}>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Trial / Event Date</label>
                                <input className={styles.fieldInput} type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Application Deadline</label>
                                <input className={styles.fieldInput} type="datetime-local" value={applicationDeadline} onChange={e => setApplicationDeadline(e.target.value)} disabled={isSubmitting} />
                            </div>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Max Applications</label>
                            <input className={styles.fieldInput} type="number" min={1} placeholder="e.g. 100 (leave blank for unlimited)" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} disabled={isSubmitting} />
                        </div>
                    </div>
                )

            // ── Step 2: Location ──────────────────────────────────────
            case 2:
                return (
                    <div className={styles.stepContent}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Venue / Location</label>
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
                                    <Icon icon="mdi:map-marker-plus-outline" width={16} height={16} />
                                    Search for location…
                                </button>
                            )}
                        </div>

                        {locationOpen && !location && (
                            <div className={styles.locationPickerWrap}>
                                <PostLocationPicker
                                    value={location}
                                    onChange={(place) => { setLocation(place); if (place) setLocationOpen(false) }}
                                    disabled={isSubmitting}
                                />
                            </div>
                        )}

                        {location && (
                            <div className={styles.mapPreview}>
                                <Icon icon="mdi:map-outline" width={28} height={28} />
                                <div>
                                    <p className={styles.mapPreviewName}>{location.name}</p>
                                    <p className={styles.mapPreviewCoords}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
                                </div>
                            </div>
                        )}

                        <p className={styles.locationNote}>
                            <Icon icon="mdi:information-outline" width={13} height={13} />
                            Location helps players find nearby trials on the map.
                        </p>
                    </div>
                )

            // ── Step 3: Positions + Questions ─────────────────────────
            case 3:
                return (
                    <div className={styles.stepContent}>
                        {positions.length > 0 && (
                            <div className={styles.fieldGroup}>
                                <label className={styles.fieldLabel}>Positions Needed</label>
                                <div className={styles.positionGrid}>
                                    {positions.map(p => {
                                        const sel = selectedPositions.find(sp => sp.position_id === p.id)
                                        const isPrimary = sel?.is_primary
                                        return (
                                            <div key={p.id} className={`${styles.positionChip} ${sel ? styles.positionChipSelected : ""}`}>
                                                <button
                                                    className={styles.positionChipBtn}
                                                    onClick={() => togglePosition(p.id, p.name)}
                                                    type="button"
                                                    disabled={isSubmitting}
                                                >
                                                    {sel && <Icon icon="mdi:check" width={11} height={11} />}
                                                    {p.name}
                                                </button>
                                                {sel && (
                                                    <button
                                                        className={`${styles.positionPrimaryBtn} ${isPrimary ? styles.positionPrimaryBtnActive : ""}`}
                                                        onClick={() => setPrimary(p.id)}
                                                        type="button"
                                                        title="Set as primary"
                                                        disabled={isSubmitting}
                                                    >
                                                        {isPrimary ? "PRIMARY" : "SET PRIMARY"}
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                Application Questions
                                <span className={styles.fieldLabelMuted}> — optional</span>
                            </label>
                            <QuestionBuilder questions={questions} onChange={setQuestions} disabled={isSubmitting} />
                        </div>
                    </div>
                )

            // ── Step 4: Media + Payment ───────────────────────────────
            case 4:
                return (
                    <div className={styles.stepContent}>
                        {/* Media */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Banner / Photos</label>
                            <MediaPreview entries={mediaEntries} onRemove={removeMedia} disabled={isSubmitting} />
                            {mediaEntries.length < 5 && (
                                <button
                                    className={styles.mediaAddBtn}
                                    onClick={() => fileInputRef.current?.click()}
                                    type="button"
                                    disabled={isSubmitting}
                                >
                                    <Icon icon="mdi:image-plus-outline" width={18} height={18} />
                                    {mediaEntries.length === 0 ? "Add Photos" : `Add More (${mediaEntries.length}/5)`}
                                </button>
                            )}
                        </div>

                        {/* Payment */}
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>
                                <span className={styles.toggleRow}>
                                    Entry Fee
                                    <button
                                        className={`${styles.toggleBtn} ${isPaid ? styles.toggleBtnOn : ""}`}
                                        onClick={() => setIsPaid(v => !v)}
                                        type="button"
                                        disabled={isSubmitting}
                                    >
                                        <span className={styles.toggleKnob} />
                                    </button>
                                </span>
                            </label>

                            {isPaid && (
                                <>
                                    {/* Goatza payment disclaimer */}
                                    <div className={styles.paymentDisclaimer}>
                                        <Icon icon="mdi:information-outline" width={15} height={15} className={styles.paymentDisclaimerIcon} />
                                        <div>
                                            <strong>Goatza does not manage payments.</strong>
                                            <p>This fee information is displayed to applicants only. You are responsible for collecting payment directly from participants.</p>
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
                                            <input
                                                className={styles.fieldInput}
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                placeholder="e.g. 300"
                                                value={feeAmount}
                                                onChange={e => setFeeAmount(e.target.value)}
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Payment Note</label>
                                        <input
                                            className={styles.fieldInput}
                                            placeholder="e.g. Payment collected on event day"
                                            value={paymentNote}
                                            onChange={e => setPaymentNote(e.target.value)}
                                            maxLength={300}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </>
                            )}
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
                            <span className={styles.headerSub}>
                                {displayName || username}
                            </span>
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

                    {/* Upload progress overlay */}
                    {phase === "uploading" && (
                        <div className={styles.uploadOverlay}>
                            <div className={styles.uploadOverlayInner}>
                                <Icon icon="mdi:cloud-upload-outline" width={28} height={28} />
                                <span>Uploading media…</span>
                                <div className={styles.uploadBarWrap}>
                                    <div
                                        className={styles.uploadBar}
                                        style={{
                                            width: `${mediaEntries.length === 0 ? 100 : Math.round(
                                                mediaEntries.reduce((s, e) => s + e.progress, 0) / mediaEntries.length
                                            )}%`
                                        }}
                                    />
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

                    {/* Error */}
                    {submitError && (
                        <p className={styles.submitError} role="alert">
                            <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                            {submitError}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <button
                        className={styles.backBtn}
                        onClick={step === 0 ? onClose : goPrev}
                        disabled={isSubmitting}
                        type="button"
                    >
                        {step === 0 ? "Cancel" : (
                            <><Icon icon="mdi:chevron-left" width={16} height={16} /> Back</>
                        )}
                    </button>

                    <div className={styles.footerRight}>
                        <span className={styles.stepCounter}>{step + 1} / {TOTAL_STEPS}</span>
                        {isLastStep ? (
                            <button
                                className={styles.publishBtn}
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                type="button"
                            >
                                <Icon icon="mdi:whistle-outline" width={15} height={15} />
                                Publish
                            </button>
                        ) : (
                            <button
                                className={styles.nextBtn}
                                onClick={goNext}
                                disabled={isSubmitting}
                                type="button"
                            >
                                Next
                                <Icon icon="mdi:chevron-right" width={16} height={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept="image/*"
                onChange={handleFileChange}
            />
        </div>
    )
}