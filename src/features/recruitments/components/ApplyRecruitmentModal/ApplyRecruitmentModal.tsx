"use client"

/**
 * ApplyRecruitmentModal — LinkedIn "Easy Apply" style, multi-step.
 *
 *   Step 1  Your details   — name / email / phone, prefilled from the auth
 *                            store, fully editable. Name + valid phone required.
 *   Step 2  Questions       — only when the recruitment has custom questions.
 *   Step 3  Success         — confirmation + Done.
 *
 * Only used for apply_method === "goatza"; external / contact CTAs stay as-is.
 * On success the parent detail query is invalidated (see useApplyRecruitment),
 * so closing the modal reveals the application-status banner.
 */

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useAuthStore } from "@/store/auth.store"
import { getApiErrorMessage, getApiFieldErrors } from "@/core/api/getApiErrorMessage"
import { useApplyRecruitment } from "../../hooks/useRecruitments"
import {
  ageGroupApplyPayload,
  ageGroupOptionLabel,
  formatReportingTime,
  isAgeGroupRequired,
  validateAgeGroupChoice,
} from "../../eligibility"
import type {
  RecruitmentDetail,
  RecruitmentQuestion,
  QuestionFieldType,
  ApplyAnswerPayload,
} from "../../services/recruitments.api"
import styles from "./ApplyRecruitmentModal.module.css"

// ── Config ────────────────────────────────────────────────────

const OPTION_TYPES: QuestionFieldType[] = ["select", "radio", "checkbox"]
const PHONE_RE = /^\+?\d{7,15}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = "details" | "questions" | "success"

const STEP_LABELS: Record<Step, string> = {
  details: "Your details",
  questions: "Questions",
  success: "Done",
}

// Per-question local answer: free text OR chosen option ids (never both).
type AnswerState = Record<string, { text: string; optionIds: string[] }>

// ── Step bar ──────────────────────────────────────────────────

function StepBar({ labels, activeIndex }: { labels: string[]; activeIndex: number }) {
  return (
    <div className={styles.stepBar}>
      {labels.map((label, i) => (
        <div
          key={label}
          className={`${styles.stepItem} ${i === activeIndex ? styles.stepActive : ""} ${i < activeIndex ? styles.stepDone : ""}`}
        >
          <div className={styles.stepDot}>
            {i < activeIndex ? <Icon icon="mdi:check" width={10} height={10} /> : <span>{i + 1}</span>}
          </div>
          <span className={styles.stepLabel}>{label}</span>
          {i < labels.length - 1 && <div className={styles.stepLine} />}
        </div>
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────

interface ApplyRecruitmentModalProps {
  recruitment: RecruitmentDetail
  onClose: () => void
}

export default function ApplyRecruitmentModal({
  recruitment,
  onClose,
}: ApplyRecruitmentModalProps) {
  const user = useAuthStore((s) => s.user)
  const { mutateAsync: applyRecruitment, isPending } = useApplyRecruitment()

  const questions = recruitment.questions
  const hasQuestions = questions.length > 0

  // Age groups the organiser published. When there are any, the applicant has
  // to say which one they're applying under — but nothing is pre-selected from
  // their profile, and no choice is ever rejected for not matching their age.
  const ageGroups = recruitment.age_categories ?? []
  const needsAgeGroup = isAgeGroupRequired(ageGroups)

  const stepOrder: Step[] = useMemo(
    () => (hasQuestions ? ["details", "questions", "success"] : ["details", "success"]),
    [hasQuestions]
  )

  const [step, setStep] = useState<Step>("details")

  // ── Step 1: contact (prefilled from the auth store, editable) ──
  const initialPhone = user?.phone ?? ""
  const [name, setName] = useState(() => user?.name ?? "")
  const [email, setEmail] = useState(() => user?.email ?? "")
  const [phone, setPhone] = useState(() => initialPhone)
  const [emailTouched, setEmailTouched] = useState(false)
  // If the profile carried no phone, prompt for it right away.
  const [phoneTouched, setPhoneTouched] = useState(() => !initialPhone)
  // Deliberately starts empty — pre-selecting from the player's birthdate
  // would make Goatza an eligibility judge, which it is not.
  const [ageGroupId, setAgeGroupId] = useState("")
  const [ageGroupTouched, setAgeGroupTouched] = useState(false)

  // ── Step 2: answers ────────────────────────────────────────────
  const [answers, setAnswers] = useState<AnswerState>(() => {
    const init: AnswerState = {}
    questions.forEach((q) => { init[q.id] = { text: "", optionIds: [] } })
    return init
  })
  const [showQuestionErrors, setShowQuestionErrors] = useState(false)

  // ── Submission ─────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Lock background scroll while open.
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = orig }
  }, [])

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  // ── Validation ─────────────────────────────────────────────────
  const normalizedPhone = phone.trim().replace(/[\s\-().]/g, "")
  const phoneValid = PHONE_RE.test(normalizedPhone)
  const emailValid = email.trim() === "" || EMAIL_RE.test(email.trim())
  const ageGroupIssue = validateAgeGroupChoice(ageGroups, ageGroupId)
  const detailsValid = name.trim().length > 0 && phoneValid && ageGroupIssue === null

  const ageGroupError =
    (ageGroupTouched ? ageGroupIssue : null) ?? fieldErrors.age_category ?? null

  const nameError = fieldErrors.shared_name ?? null
  const phoneError =
    (phoneTouched && !phoneValid
      ? phone.trim() === ""
        ? "Phone number is required to apply"
        : "Enter a valid phone number"
      : null) ?? fieldErrors.shared_phone ?? null
  const emailError =
    (emailTouched && email.trim() !== "" && !emailValid
      ? "Enter a valid email address"
      : null) ?? fieldErrors.shared_email ?? null

  const isAnswered = (q: RecruitmentQuestion) => {
    const a = answers[q.id]
    return OPTION_TYPES.includes(q.field_type) ? a.optionIds.length > 0 : a.text.trim().length > 0
  }

  const questionError = (q: RecruitmentQuestion): string | null => {
    const a = answers[q.id]
    if (q.is_required && !isAnswered(q)) return "This question is required."
    if (q.field_type === "number" && a.text.trim() && Number.isNaN(Number(a.text.trim())))
      return "Enter a valid number."
    return null
  }

  const questionsValid = questions.every((q) => questionError(q) === null)

  // ── Answer setters ─────────────────────────────────────────────
  const setText = (qid: string, text: string) =>
    setAnswers((p) => ({ ...p, [qid]: { ...p[qid], text } }))

  const setSingleOption = (qid: string, optionId: string) =>
    setAnswers((p) => ({ ...p, [qid]: { ...p[qid], optionIds: optionId ? [optionId] : [] } }))

  const toggleOption = (qid: string, optionId: string) =>
    setAnswers((p) => {
      const current = p[qid].optionIds
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
      return { ...p, [qid]: { ...p[qid], optionIds: next } }
    })

  // ── Submit ─────────────────────────────────────────────────────
  const buildAnswers = (): ApplyAnswerPayload[] =>
    questions.flatMap((q): ApplyAnswerPayload[] => {
      const a = answers[q.id]
      if (OPTION_TYPES.includes(q.field_type)) {
        if (a.optionIds.length === 0) return []
        return [{ question_id: q.id, selected_option_ids: a.optionIds }]
      }
      if (!a.text.trim()) return []
      return [{ question_id: q.id, answer_text: a.text.trim() }]
    })

  const submit = async () => {
    setSubmitError(null)
    try {
      await applyRecruitment({
        recruitmentId: recruitment.id,
        payload: {
          shared_name: name.trim(),
          shared_email: email.trim() || undefined,
          shared_phone: phone.trim(),
          // Omitted entirely when the recruitment has no age groups.
          ...ageGroupApplyPayload(ageGroups, ageGroupId),
          answers: buildAnswers(),
        },
      })
      setStep("success")
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, "Couldn't submit your application. Please try again."))
      // Route shared-contact field errors back to the details step.
      const serverErrors = getApiFieldErrors(err)
      if (serverErrors) {
        const known: Record<string, string> = {}
        for (const key of ["shared_name", "shared_email", "shared_phone", "age_category"]) {
          if (serverErrors[key]) known[key] = serverErrors[key]
        }
        if (Object.keys(known).length > 0) {
          setFieldErrors(known)
          setStep("details")
        }
      }
    }
  }

  // Details step primary: advance to questions, or submit if there are none.
  const onDetailsPrimary = () => {
    if (!detailsValid) {
      setPhoneTouched(true)
      setEmailTouched(true)
      setAgeGroupTouched(true)
      return
    }
    setSubmitError(null)
    if (hasQuestions) setStep("questions")
    else submit()
  }

  // Questions step primary: validate inline, block submit until valid.
  const onQuestionsPrimary = () => {
    if (!questionsValid) {
      setShowQuestionErrors(true)
      return
    }
    submit()
  }

  const activeIndex = stepOrder.indexOf(step)
  const stepLabels = stepOrder.map((s) => STEP_LABELS[s])

  const backdropClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isPending) onClose()
  }

  // Portal to <body> so the fixed backdrop escapes any ancestor containing
  // block — RecruitmentDetail's .wrapper holds an animated transform, which
  // would otherwise trap this modal inside the content column. The modal only
  // mounts on a click (client-only), so the SSR guard is just belt-and-braces.
  if (typeof document === "undefined") return null

  // ── Success screen ─────────────────────────────────────────────
  if (step === "success") {
    const chosenGroup = ageGroups.find((g) => g.id === ageGroupId) ?? null
    const reportingTime = formatReportingTime(chosenGroup?.reporting_time)
    return createPortal(
      <div className={styles.backdrop} onClick={backdropClose} role="dialog" aria-modal="true">
        <div className={styles.modal}>
          <div className={styles.body}>
            <div className={styles.success}>
              <span className={styles.successTick}>
                <Icon icon="mdi:check-circle" width={56} height={56} />
              </span>
              <span className={styles.successTitle}>Application submitted</span>
              <p className={styles.successText}>
                You applied to {recruitment.title}. The organization will review your application.
              </p>
              {chosenGroup && (
                <div className={styles.successGroup}>
                  <Icon icon="mdi:account-group-outline" width={15} height={15} />
                  <span>
                    Applying under <strong>{chosenGroup.title}</strong>
                    {reportingTime ? ` · report by ${reportingTime}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className={styles.successFooter}>
            <button className={styles.doneBtn} onClick={onClose} type="button">
              <Icon icon="mdi:check" width={16} height={16} />
              Done
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ── Field renderer (questions step) ────────────────────────────
  const renderField = (q: RecruitmentQuestion) => {
    const a = answers[q.id]
    switch (q.field_type) {
      case "long_text":
        return (
          <textarea
            className={styles.fieldTextarea}
            value={a.text}
            onChange={(e) => setText(q.id, e.target.value)}
            placeholder={q.placeholder || "Your answer"}
            rows={3}
            disabled={isPending}
          />
        )
      case "number":
        return (
          <input
            className={styles.fieldInput}
            type="number"
            value={a.text}
            onChange={(e) => setText(q.id, e.target.value)}
            placeholder={q.placeholder || "Enter a number"}
            disabled={isPending}
          />
        )
      case "select":
        return (
          <select
            className={styles.fieldSelect}
            value={a.optionIds[0] ?? ""}
            onChange={(e) => setSingleOption(q.id, e.target.value)}
            disabled={isPending}
          >
            <option value="">{q.placeholder || "— Select —"}</option>
            {q.options.map((o) => (
              <option key={o.id} value={o.id}>{o.value}</option>
            ))}
          </select>
        )
      case "radio":
        return (
          <div className={styles.optionGroup} role="radiogroup">
            {q.options.map((o) => {
              const checked = a.optionIds[0] === o.id
              return (
                <label
                  key={o.id}
                  className={`${styles.optionChoice} ${checked ? styles.optionChoiceActive : ""} ${isPending ? styles.optionChoiceDisabled : ""}`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={checked}
                    onChange={() => setSingleOption(q.id, o.id)}
                    disabled={isPending}
                  />
                  <span>{o.value}</span>
                </label>
              )
            })}
          </div>
        )
      case "checkbox":
        return (
          <div className={styles.optionGroup}>
            {q.options.map((o) => {
              const checked = a.optionIds.includes(o.id)
              return (
                <label
                  key={o.id}
                  className={`${styles.optionChoice} ${checked ? styles.optionChoiceActive : ""} ${isPending ? styles.optionChoiceDisabled : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(q.id, o.id)}
                    disabled={isPending}
                  />
                  <span>{o.value}</span>
                </label>
              )
            })}
          </div>
        )
      default: // short_text
        return (
          <input
            className={styles.fieldInput}
            value={a.text}
            onChange={(e) => setText(q.id, e.target.value)}
            placeholder={q.placeholder || "Your answer"}
            disabled={isPending}
          />
        )
    }
  }

  // ── Form (details / questions) ─────────────────────────────────
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={backdropClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Apply to ${recruitment.title}`}
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Avatar
              src={recruitment.organization.logo}
              initials={recruitment.organization.name?.slice(0, 2).toUpperCase()}
              size="sm"
            />
            <div className={styles.headerText}>
              <h2 className={styles.headerTitle}>Apply</h2>
              <span className={styles.headerSub}>{recruitment.title}</span>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isPending}
            type="button"
            aria-label="Close"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <StepBar labels={stepLabels} activeIndex={activeIndex} />

        {/* Body */}
        <div className={styles.body}>
          {step === "details" && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <Icon icon="mdi:account-outline" width={16} height={16} />
                Your details
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Name <span className={styles.required}>*</span>
                </label>
                <input
                  className={`${styles.fieldInput} ${nameError ? styles.fieldInputError : ""}`}
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearFieldError("shared_name") }}
                  placeholder="Your full name"
                  maxLength={255}
                  disabled={isPending}
                />
                {nameError && (
                  <span className={styles.fieldErrorText} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                    {nameError}
                  </span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Email <span className={styles.optionalTag}>Optional</span>
                </label>
                <input
                  className={`${styles.fieldInput} ${emailError ? styles.fieldInputError : ""}`}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError("shared_email") }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="you@example.com"
                  disabled={isPending}
                />
                {emailError && (
                  <span className={styles.fieldErrorText} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                    {emailError}
                  </span>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Phone <span className={styles.required}>*</span>
                </label>
                <input
                  className={`${styles.fieldInput} ${phoneError ? styles.fieldInputError : ""}`}
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearFieldError("shared_phone") }}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="+91 XXXXX XXXXX"
                  maxLength={15}
                  disabled={isPending}
                />
                {phoneError && (
                  <span className={styles.fieldErrorText} role="alert">
                    <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                    {phoneError}
                  </span>
                )}
              </div>

              {/* Age group — only when the organiser published groups. */}
              {needsAgeGroup && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Which age group are you applying for? <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={`${styles.fieldInput} ${ageGroupError ? styles.fieldInputError : ""}`}
                    value={ageGroupId}
                    onChange={(e) => {
                      setAgeGroupId(e.target.value)
                      setAgeGroupTouched(true)
                      clearFieldError("age_category")
                    }}
                    onBlur={() => setAgeGroupTouched(true)}
                    disabled={isPending}
                  >
                    <option value="">— Select a group —</option>
                    {ageGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {ageGroupOptionLabel(group)}
                      </option>
                    ))}
                  </select>
                  {ageGroupError && (
                    <span className={styles.fieldErrorText} role="alert">
                      <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                      {ageGroupError}
                    </span>
                  )}
                </div>
              )}

              <div className={styles.shareNote}>
                <Icon icon="mdi:shield-account-outline" width={15} height={15} />
                These details will be shared with {recruitment.organization.name}.
              </div>
            </div>
          )}

          {step === "questions" && (
            <div className={styles.stepContent}>
              <div className={styles.stepIntro}>
                <Icon icon="mdi:comment-question-outline" width={16} height={16} />
                A few questions
              </div>
              <div className={styles.questionList}>
                {questions.map((q) => {
                  const err = showQuestionErrors ? questionError(q) : null
                  return (
                    <div key={q.id} className={styles.questionCard}>
                      <label className={styles.questionLabel}>
                        {q.question}
                        {q.is_required && <span className={styles.required}>*</span>}
                      </label>
                      {q.help_text && <p className={styles.questionHelp}>{q.help_text}</p>}
                      {renderField(q)}
                      {err && (
                        <span className={styles.fieldErrorText} role="alert">
                          <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                          {err}
                        </span>
                      )}
                    </div>
                  )
                })}
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
          <button
            className={styles.backBtn}
            onClick={step === "details" ? onClose : () => setStep("details")}
            disabled={isPending}
            type="button"
          >
            {step === "details" ? "Cancel" : <><Icon icon="mdi:chevron-left" width={16} height={16} /> Back</>}
          </button>

          <div className={styles.footerRight}>
            <span className={styles.stepCounter}>{activeIndex + 1} / {stepOrder.length}</span>

            {step === "details" && hasQuestions ? (
              <button
                className={styles.nextBtn}
                onClick={onDetailsPrimary}
                disabled={!detailsValid || isPending}
                type="button"
              >
                Next <Icon icon="mdi:chevron-right" width={16} height={16} />
              </button>
            ) : (
              <button
                className={styles.submitBtn}
                onClick={step === "details" ? onDetailsPrimary : onQuestionsPrimary}
                disabled={isPending || (step === "details" && !detailsValid)}
                type="button"
              >
                {isPending ? (
                  <Icon icon="mdi:loading" className={styles.spinner} width={16} height={16} />
                ) : (
                  <Icon icon="mdi:send-outline" width={15} height={15} />
                )}
                {isPending ? "Submitting…" : "Submit application"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
