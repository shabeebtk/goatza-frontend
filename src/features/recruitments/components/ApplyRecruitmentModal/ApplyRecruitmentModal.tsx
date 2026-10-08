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

import { useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Select from "@/shared/components/ui/Select/Select"
import { useAuthStore } from "@/store/auth.store"
import { getApiErrorMessage, getApiFieldErrors } from "@/core/api/getApiErrorMessage"
import { useApplyRecruitment } from "../../hooks/useRecruitments"
import {
  ageGroupApplyPayload,
  ageGroupOptionLabel,
  birthYearInGroup,
  categoriesForSession,
  effectiveGender,
  formatBirthYears,
  formatReportingTime,
  genderFitsGroup,
  genderLabel,
  isAgeGroupRequired,
  sessionsForCategory,
  validateAgeGroupChoice,
} from "../../eligibility"
import type {
  RecruitmentDetail,
  RecruitmentQuestion,
  QuestionFieldType,
  ApplyAnswerPayload,
} from "../../services/recruitments.api"
import {
  isMultiPlace,
  sessionOptionLabel,
  sessionsByDistance,
  upcomingSessions,
} from "../../sessionDisplay"
import styles from "./ApplyRecruitmentModal.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"

// ── Config ────────────────────────────────────────────────────

const OPTION_TYPES: QuestionFieldType[] = ["select", "radio", "checkbox"]
// The server's own words when a category is not held at the chosen centre
// (ApplicationService._check_category_runs_at). Matched loosely — on the
// stable half of the sentence — so a copy tweak at either end does not
// silently send it back to the generic banner.
const CATEGORY_CENTRE_REFUSAL = /category doesn.t run at the centre/i
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

// ── Locked pick ────────────────────────────────

/**
 * A field whose answer was FORCED — the other picker narrowed it to one
 * option and the form filled it in.
 *
 * Shown instead of a select with a single item, because a one-item select
 * asks a question that has no second answer. The "Change" link is the whole
 * reason this is not just plain text: the player can always get back to the
 * full list, which is what keeps the auto-pick a convenience rather than a
 * decision made for them.
 */
function LockedPick({ label, icon, changeLabel, onChange, disabled }: {
  label: string
  icon: string
  changeLabel: string
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className={styles.lockedPick}>
      <Icon icon={icon} width={15} height={15} className={styles.lockedPickIcon} />
      <span className={styles.lockedPickText}>{label}</span>
      <button
        type="button"
        className={styles.lockedPickChange}
        onClick={onChange}
        disabled={disabled}
      >
        {changeLabel}
      </button>
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

  // TRIAL DATES. Only a `choose_one` trial asks the player to pick one —
  // that mode exists so somebody can name the city nearest them. In `all`
  // mode every date is the same trial and there is nothing to choose.
  //
  // A date that has already passed is hidden rather than shown disabled:
  // the server refuses it, and an option that cannot be taken is noise.
  // The comparison is trialDay's, never a second one — and it is made on the
  // VENUE's calendar, so a date is offered for exactly as long as the ground
  // it is at would still call it today.
  const needsSession = recruitment.session_mode === "choose_one"
  // A CITY TOUR, not two Saturdays at one ground: it changes the noun this
  // form asks with, and nothing else about it.
  const multiPlace = isMultiPlace(recruitment)
  // The clock lives inside upcomingSessions, the same way isTrialOver owns
  // its own `now` — reading it in the component body is an impure call
  // during render.
  //
  // TWO STEPS, IN THIS ORDER. `upcomingSessions` decides WHICH centres may be
  // picked — the eligibility rule, unchanged and still the server's — and
  // `sessionsByDistance` only decides what order they are offered in. A
  // Kozhikode player stops scrolling past Kochi, Thrissur and Trivandrum to
  // reach the one 4 km away.
  //
  // Nothing is preselected. The ordering is a convenience; auto-picking the
  // nearest would answer a required question on the player's behalf.
  const everySessionOption = useMemo(
    () =>
      needsSession
        ? sessionsByDistance(
            upcomingSessions(recruitment.sessions, recruitment.timezone),
          )
        : [],
    [needsSession, recruitment.sessions, recruitment.timezone],
  )

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
  const [sessionId, setSessionId] = useState("")
  const [sessionTouched, setSessionTouched] = useState(false)
  const [ageGroupTouched, setAgeGroupTouched] = useState(false)
  // "I've checked — apply anyway". Reset whenever the group changes: an
  // acknowledgement is about ONE group, not a standing waiver.
  const [fitAck, setFitAck] = useState(false)
  const fitWarningTitleId = useId()
  /**
   * WHICH PICKER THE PLAYER ANSWERED LAST.
   *
   * The two pickers filter each other, so a pair that stops agreeing has to
   * resolve SOMEHOW — and without this both sides would clear each other in
   * the same commit and the player would lose the pick they just made. The
   * answer they gave most recently is the one they meant; the other yields.
   */
  const [lastPicked, setLastPicked] = useState<"session" | "category" | null>(null)
  /**
   * Fields the player has deliberately UNLOCKED, by tapping "Change" on an
   * auto-filled one. Without it the auto-pick below would put the single
   * option straight back and the link would do nothing.
   */
  const [sessionUnlocked, setSessionUnlocked] = useState(false)
  const [ageGroupUnlocked, setAgeGroupUnlocked] = useState(false)

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
  useBodyScrollLock()

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  // ── The two pickers, which FILTER EACH OTHER ──────────────────
  //
  // A category can be held at only some of a trial's centres, so "U17 Girls"
  // and "Sunday at Kannur" are one decision made in two fields. Each side
  // narrows the other, which is what stops the form offering a pair the
  // server will refuse — and, when the narrowing leaves one option, what
  // makes the whole thing a single tap.
  //
  // EMPTY MEANS ALL on both sides, so a trial where no category names a
  // centre filters nothing and behaves exactly as it always has.
  const selectedGroup = ageGroups.find((group) => group.id === ageGroupId)

  const sessionOptions = useMemo(
    () => sessionsForCategory(everySessionOption, selectedGroup),
    [everySessionOption, selectedGroup],
  )
  const ageGroupOptions = useMemo(
    () => (sessionId ? categoriesForSession(ageGroups, sessionId) : ageGroups),
    [ageGroups, sessionId],
  )

  // Two different dead ends, and they need different words: a trial whose
  // dates have all passed, versus a category whose own dates have.
  const noDatesLeft = needsSession && everySessionOption.length === 0
  const noDatesForGroup =
    needsSession && !noDatesLeft && sessionOptions.length === 0

  // A FORCED CHOICE IS NOT A CHOICE. One option left and the field still
  // empty: fill it, and show it as a filled pill the player can undo rather
  // than a select with a single item in it.
  const sessionLocked =
    needsSession && !sessionUnlocked && sessionOptions.length === 1
  const ageGroupLocked =
    needsAgeGroup && !ageGroupUnlocked && ageGroupOptions.length === 1

  useEffect(() => {
    if (sessionLocked && !sessionId) setSessionId(sessionOptions[0].id)
  }, [sessionLocked, sessionId, sessionOptions])

  useEffect(() => {
    if (ageGroupLocked && !ageGroupId) setAgeGroupId(ageGroupOptions[0].id)
  }, [ageGroupLocked, ageGroupId, ageGroupOptions])

  // A PICK THE OTHER SIDE JUST INVALIDATED is dropped rather than carried to
  // a submit the server would refuse. `lastPicked` decides who yields — see
  // that state. The touched flag goes with it: the field is being emptied by
  // the form, not left blank by the player, so it must not read as an error
  // until they have been back to it.
  useEffect(() => {
    if (
      sessionId
      && lastPicked !== "session"
      && !sessionOptions.some((session) => session.id === sessionId)
    ) {
      setSessionId("")
      setSessionTouched(false)
    }
  }, [sessionId, sessionOptions, lastPicked])

  useEffect(() => {
    if (
      ageGroupId
      && lastPicked !== "category"
      && !ageGroupOptions.some((group) => group.id === ageGroupId)
    ) {
      setAgeGroupId("")
      setAgeGroupTouched(false)
      setFitAck(false)
    }
  }, [ageGroupId, ageGroupOptions, lastPicked])

  const pickSession = (id: string) => {
    setSessionId(id)
    setSessionTouched(true)
    setLastPicked("session")
    // The category may now be forced, so let it re-lock.
    setAgeGroupUnlocked(false)
    clearFieldError("session")
    clearFieldError("age_category")
  }

  const pickAgeGroup = (id: string) => {
    if (id !== ageGroupId) setFitAck(false)
    setAgeGroupId(id)
    setAgeGroupTouched(true)
    setLastPicked("category")
    setSessionUnlocked(false)
    clearFieldError("age_category")
    clearFieldError("session")
  }

  // ── Validation ─────────────────────────────────────────────────
  const normalizedPhone = phone.trim().replace(/[\s\-().]/g, "")
  const phoneValid = PHONE_RE.test(normalizedPhone)
  const emailValid = email.trim() === "" || EMAIL_RE.test(email.trim())
  const ageGroupIssue = validateAgeGroupChoice(ageGroups, ageGroupId)

  // FIT WARNINGS — the player's own profile (birth year and gender, both sent
  // on the authenticated detail only) against the category they picked, each
  // read exactly the way the backend reads it: `age_mismatch_at_apply` for
  // the band, `effective_genders` for the gender. They make the player LOOK;
  // they never refuse. Once acknowledged the application goes through exactly
  // as before, and nothing about either is sent — the server works the age
  // flag out itself and the gender is simply the org's to see on the row.
  //
  // MISSING DATA IS NEVER A MISMATCH. An unknown birth year (null) or gender,
  // and an older payload carrying neither (undefined), warn about nothing.
  const viewerBirthYear = recruitment.viewer_birth_year
  const viewerGender = recruitment.viewer_gender
  const showAgeWarning =
    needsAgeGroup &&
    typeof viewerBirthYear === "number" &&
    !!selectedGroup &&
    !birthYearInGroup(selectedGroup, viewerBirthYear)
  const showGenderWarning =
    needsAgeGroup &&
    !!selectedGroup &&
    !genderFitsGroup(selectedGroup, recruitment.gender, viewerGender)
  // ONE BOX, whichever of the two applies — two stacked warnings about the
  // same pick read as two problems, and would need two ticks for one choice.
  const showFitWarning = showAgeWarning || showGenderWarning
  const fitAckMissing = showFitWarning && !fitAck

  // A date is required exactly when the trial asks for one, and only a
  // date still on offer counts — the same rule the server applies.
  const sessionIssue =
    needsSession && !sessionOptions.some(session => session.id === sessionId)
      ? (noDatesLeft
        ? "No dates left on this trial"
        : noDatesForGroup
          ? "That category has no dates left. Pick another category."
          : "Pick which date you'll attend.")
      : null

  const detailsValid =
    name.trim().length > 0 && phoneValid && ageGroupIssue === null
    && sessionIssue === null && !fitAckMissing

  const sessionError =
    (sessionTouched || noDatesLeft || noDatesForGroup ? sessionIssue : null)
    ?? fieldErrors.session ?? null

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
          // ...and the same for the date: sent only in `choose_one`,
          // where the server requires it. Nothing at all otherwise.
          ...(needsSession && sessionId ? { session: sessionId } : {}),
          answers: buildAnswers(),
        },
      })
      setStep("success")
    } catch (err) {
      const message = getApiErrorMessage(err, "Couldn't submit your application. Please try again.")
      setSubmitError(message)
      // Route shared-contact field errors back to the details step.
      const serverErrors = getApiFieldErrors(err)
      const known: Record<string, string> = {}
      if (serverErrors) {
        for (const key of [
          "shared_name", "shared_email", "shared_phone", "age_category", "session",
        ]) {
          if (serverErrors[key]) known[key] = serverErrors[key]
        }
      }
      // THE CATEGORY-AT-THIS-CENTRE REFUSAL arrives as a plain message, not a
      // keyed field error (the server raises it as one sentence), so it would
      // otherwise land only in the generic banner at the bottom. It is about
      // the category field, and the fix is in the category field — the modal
      // filters the two lists against each other precisely so this is
      // unreachable, which is also why it earns a sentence rather than a
      // guess at which side is wrong.
      if (!known.age_category && CATEGORY_CENTRE_REFUSAL.test(message)) {
        known.age_category = message
      }
      if (Object.keys(known).length > 0) {
        setFieldErrors(known)
        setStep("details")
      }
    }
  }

  // Details step primary: advance to questions, or submit if there are none.
  const onDetailsPrimary = () => {
    if (!detailsValid) {
      setPhoneTouched(true)
      setEmailTouched(true)
      setAgeGroupTouched(true)
      setSessionTouched(true)
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
          <Select
            aria-label={q.question}
            sheetTitle={q.question}
            placeholder={q.placeholder || "— Select —"}
            value={a.optionIds[0] ?? ""}
            onChange={(optionId) => setSingleOption(q.id, optionId)}
            disabled={isPending}
            options={q.options.map((o) => ({ value: o.id, label: o.value }))}
          />
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

              {/* Which DATE — only when each date is its own round. Sits
                  above the age group because the city is the thing a player
                  on a tour decides first.

                  On a tour the noun changes: four grounds in four cities are
                  not four dates, and "which date" asks the player to answer
                  with the wrong thing. `isMultiPlace` is the test — two
                  Saturdays at one stadium is still a date. */}
              {needsSession && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    {multiPlace
                      ? "Which centre will you attend?"
                      : "Which date will you attend?"}{" "}
                    <span className={styles.required}>*</span>
                  </label>
                  {noDatesLeft ? (
                    <p className={styles.ageHint}>No dates left on this trial.</p>
                  ) : sessionLocked ? (
                    /* THE CATEGORY ALREADY ANSWERED THIS. Only one centre
                       holds it, so the field states the answer instead of
                       asking — with the way back, because the player may
                       have meant a different category. */
                    <LockedPick
                      label={sessionOptionLabel(sessionOptions[0], recruitment)}
                      icon={multiPlace ? "mdi:map-marker-outline" : "mdi:calendar-blank-outline"}
                      changeLabel={multiPlace ? "Change centre" : "Change date"}
                      onChange={() => {
                        setSessionUnlocked(true)
                        setSessionId("")
                        setSessionTouched(false)
                      }}
                      disabled={isPending}
                    />
                  ) : (
                    <Select
                      aria-label={multiPlace ? "Trial centre" : "Trial date"}
                      sheetTitle={multiPlace ? "Trial centre" : "Trial date"}
                      placeholder={
                        multiPlace ? "— Select a centre —" : "— Select a date —"
                      }
                      value={sessionId}
                      onChange={pickSession}
                      onBlur={() => setSessionTouched(true)}
                      disabled={isPending}
                      options={sessionOptions.map((session) => ({
                        value: session.id,
                        label: sessionOptionLabel(session, recruitment),
                      }))}
                    />
                  )}
                  {sessionError && (
                    <span className={styles.fieldErrorText} role="alert">
                      <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                      {sessionError}
                    </span>
                  )}
                </div>
              )}

              {/* Age group — only when the organiser published groups. */}
              {needsAgeGroup && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Which category are you applying for? <span className={styles.required}>*</span>
                  </label>
                  {ageGroupLocked ? (
                    /* THE CENTRE ALREADY ANSWERED THIS — the mirror of the
                       locked pill above. Labelled from the single OPTION
                       rather than the picked value, so the pill is right on
                       the very first frame instead of flashing a one-item
                       select while the effect fills the field in. */
                    <LockedPick
                      label={ageGroupOptionLabel(ageGroupOptions[0], recruitment.gender)}
                      icon="mdi:account-group-outline"
                      changeLabel="Change category"
                      onChange={() => {
                        setAgeGroupUnlocked(true)
                        setAgeGroupId("")
                        setAgeGroupTouched(false)
                        setFitAck(false)
                      }}
                      disabled={isPending}
                    />
                  ) : (
                    <Select
                      aria-label="Category"
                      sheetTitle="Category"
                      placeholder="— Select a category —"
                      value={ageGroupId}
                      onChange={pickAgeGroup}
                      onBlur={() => setAgeGroupTouched(true)}
                      disabled={isPending}
                      options={ageGroupOptions.map((group) => ({
                        value: group.id,
                        label: ageGroupOptionLabel(group, recruitment.gender),
                      }))}
                    />
                  )}
                  {ageGroupError && (
                    <span className={styles.fieldErrorText} role="alert">
                      <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                      {ageGroupError}
                    </span>
                  )}
                  {/* No birth year on file: never a warning, never a block —
                      just the one line that would let the org check. */}
                  {viewerBirthYear === null && (
                    <p className={styles.ageHint}>
                      Add your birth year to your profile so organizations can confirm your age group.
                    </p>
                  )}
                </div>
              )}

              <div className={styles.shareNote}>
                <Icon icon="mdi:shield-account-outline" width={15} height={15} />
                These details will be shared with {recruitment.organization.name}.
              </div>

              {/* Directly above the primary button, which stays disabled
                  until the box is ticked. A block in the form, not a toast:
                  it has to be read. */}
              {showFitWarning && selectedGroup && (
                <div className={styles.ageWarning} role="group" aria-labelledby={fitWarningTitleId}>
                  <Icon icon="mdi:alert-outline" width={20} height={20} className={styles.ageWarningIcon} />
                  <div className={styles.ageWarningBody}>
                    <p id={fitWarningTitleId} className={styles.ageWarningTitle}>
                      Check this category
                    </p>
                    {/* WHICHEVER APPLY, in one box and under one tick. Both
                        read the same way round: what the PROFILE says, then
                        what the CATEGORY is for — so the player can see at a
                        glance which of the two is the one that is wrong. */}
                    {showAgeWarning && (
                      <p className={styles.ageWarningText}>
                        Your profile says you were born in {viewerBirthYear}.
                        <br />
                        This category is for players{" "}
                        {formatBirthYears(selectedGroup.min_birth_year, selectedGroup.max_birth_year).toLowerCase()}.
                      </p>
                    )}
                    {showGenderWarning && (
                      <p className={styles.ageWarningText}>
                        Your profile says {viewerGender}.
                        <br />
                        This category is for{" "}
                        {genderLabel(effectiveGender(selectedGroup, recruitment.gender)).toLowerCase()}.
                      </p>
                    )}
                    <p className={styles.ageWarningText}>
                      Organizations check documents at the trial. Applying under the
                      wrong category usually means being turned away at the gate.
                    </p>
                    <label className={styles.ageWarningAck}>
                      <input
                        type="checkbox"
                        checked={fitAck}
                        onChange={(e) => setFitAck(e.target.checked)}
                        disabled={isPending}
                      />
                      I&apos;ll apply anyway
                    </label>
                  </div>
                </div>
              )}
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
