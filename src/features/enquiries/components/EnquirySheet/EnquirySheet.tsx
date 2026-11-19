"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Icon } from "@iconify/react"

import { FieldError, PageTextArea, PageTextField } from "@/features/orgPage/components/PageFields/PageFields"
import PageSegmented from "@/features/orgPage/components/PageSegmented/PageSegmented"
import { initialsOf, orgNoun } from "@/features/orgPage/format"
import type { PageShowcase } from "@/features/orgPage/types"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import Portal from "@/shared/components/ui/Portal/Portal"
import Select from "@/shared/components/ui/Select/Select"
import { blurActiveInput, keepFocusProps } from "@/shared/hooks/keepFocus"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useFocusedFieldVisible } from "@/shared/hooks/useFocusedFieldVisible"
import { useGuardedBack } from "@/shared/hooks/useGuardedBack"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { revealChrome } from "@/shared/hooks/useScrollChrome"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import { returnFocus } from "@/shared/services/focusReturn"
import { reanchorFixedElements, settleViewport } from "@/shared/utils/settleViewport"
import { useAuthStore } from "@/store/auth.store"
import {
  BEST_TIMES,
  MESSAGE_MAX,
  UNDERAGE_NOTE,
  buildEnquiryPayload,
  emptyEnquiry,
  firstErrorField,
  hasTyped,
  isUnderageSelf,
  programOptionLabel,
  sentSnapshot,
  serverFieldErrors,
  switchToChild,
  validateEnquiry,
  type EnquiryField,
  type EnquiryForm,
  type FieldErrors,
  type ForWhom,
  type SentSnapshot,
} from "../../enquiryForm"
import { submitEnquiry } from "../../services/enquirySubmit.api"
import type { EnquirySent } from "../../types"
import EnquirySentView from "./EnquirySentView"
import styles from "./EnquirySheet.module.css"

/** What the sheet needs to know about the org, from the profile it opens on. */
export type EnquirySheetOrg = {
  id: string
  username: string
  name: string
  logo: string
  type: string
  /** Every branch, from the profile bundle. The Branch field shows with two or more. */
  locations: { id: string; name: string; city: string }[]
  /** The signed-in viewer already follows it (the sent screen's follow prompt). */
  isFollowing: boolean
}

export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again."
export const NETWORK_MESSAGE = "Couldn't send your enquiry. Check your connection and try again."
export const THROTTLED_MESSAGE = "Too many attempts from this network. Try again in an hour."
export const TOO_MANY_MESSAGE = "You've already sent a few enquiries today. They'll be in touch."
export const CLOSED_MESSAGE = "This page isn't taking enquiries right now."
const FAILED_MESSAGE = "Couldn't send your enquiry. Try again in a moment."

const WHO_OPTIONS: { value: ForWhom; label: string }[] = [
  { value: "child", label: "My child" },
  { value: "self", label: "Me" },
]

type Phase =
  | { kind: "form" }
  | { kind: "sent"; enquiry: EnquirySent; snapshot: SentSnapshot }
  | { kind: "closed" }

/**
 * The page's enquiry form: full screen on a phone, a 560px dialog from 768px.
 * It follows the overlay rules (scroll lock, one history entry so back closes
 * it, the visible area so the footer stays above the keyboard, keepFocusProps on
 * what is tapped while typing, settleViewport on every way out) and asks before
 * throwing away anything typed. "Enquiry sent" replaces the form in place.
 */
export default function EnquirySheet({
  org,
  page,
  anonymous,
  initialProgramId,
  onClose,
}: {
  org: EnquirySheetOrg
  page: PageShowcase
  anonymous: boolean
  /** "" opens on "Not sure yet". */
  initialProgramId: string
  onClose: () => void
}) {
  // Taken during the first render, before anything in the sheet takes focus.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
  )

  useBodyScrollLock()
  useVisualViewport()
  // Full screen below 768px, over the bars: the toasts stop offsetting for them.
  const isPhone = useMediaQuery("(max-width: 767px)")
  useHtmlFlag("chrome-covered", isPhone)

  // Declared after the scroll lock, so it runs after the release: the bars come
  // back, iOS re-anchors the fixed elements, and focus goes back to the button
  // that opened the sheet.
  useEffect(
    () => () => {
      revealChrome()
      reanchorFixedElements()
      returnFocus(opener)
    },
    [opener]
  )

  const interceptBackRef = useRef<(() => boolean) | null>(null)
  // Every way out comes through here: the X, Esc, the backdrop, the back
  // gesture, Discard, Close and "Back to the club".
  const { guard, close } = useGuardedBack(
    () => {
      void settleViewport()
      onClose()
    },
    () => interceptBackRef.current?.() ?? false
  )

  const programs = page.programs ?? []
  const locations = org.locations ?? []
  const noun = orgNoun(org.type)
  const viewerName = useAuthStore((state) => (anonymous ? "" : (state.user?.name ?? "")))
  const branchOf = (programId: string) => {
    const id = programs.find((program) => program.id === programId)?.location?.id ?? ""
    return locations.some((location) => location.id === id) ? id : ""
  }

  const [start] = useState<EnquiryForm>(() =>
    emptyEnquiry({ programId: initialProgramId, locationId: branchOf(initialProgramId), viewerName })
  )
  const [form, setForm] = useState<EnquiryForm>(start)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  /** The server's own sentence after it asked for a guardian. */
  const [guardianNote, setGuardianNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [phase, setPhase] = useState<Phase>({ kind: "form" })
  const [confirmingClose, setConfirmingClose] = useState(false)

  const baseId = useId()
  const titleId = `${baseId}-title`
  const fieldId = (field: EnquiryField) => `${baseId}-${field}`
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  useFocusedFieldVisible(bodyRef)

  const underage = isUnderageSelf(form)
  const dirty = phase.kind === "form" && hasTyped(form, start)

  // Focus goes into the first field, the "Who is this for?" choice, which opens
  // no keyboard.
  useEffect(() => {
    sheetRef.current
      ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?.focus({ preventScroll: true })
  }, [])

  // After a failed check, the first field with an error takes focus once its
  // error is on screen, so the error is read with it.
  const focusNext = useRef<EnquiryField | null>(null)
  useEffect(() => {
    const field = focusNext.current
    if (!field) return
    focusNext.current = null
    document.getElementById(fieldId(field))?.focus()
  })

  // The sent and closed screens take focus at their heading.
  const phaseHeadingRef = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    if (phase.kind !== "form") phaseHeadingRef.current?.focus({ preventScroll: true })
  }, [phase.kind])

  const requestClose = () => {
    if (sendingRef.current) return
    if (dirty) {
      setConfirmingClose(true)
      return
    }
    close()
  }

  // A back press gets the X's answer. Mid-send it is refused: the sheet stays.
  useEffect(() => {
    interceptBackRef.current = () => {
      if (sendingRef.current) return true
      if (!dirty) return false
      setConfirmingClose(true)
      return true
    }
    return () => {
      interceptBackRef.current = null
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || confirmingClose) return
      requestClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  const update = (patch: Partial<EnquiryForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    const touched = Object.keys(patch) as (keyof EnquiryForm)[]
    if (touched.some((key) => key in errors)) {
      setErrors((current) => {
        const next = { ...current }
        for (const key of touched) delete next[key as EnquiryField]
        return next
      })
    }
  }

  const chooseWho = (forWhom: ForWhom) => {
    setGuardianNote(null)
    setErrors({})
    update({ forWhom })
  }

  const moveToChild = () => {
    setErrors({})
    setForm((current) => switchToChild(current))
    focusNext.current = "guardianName"
  }

  const chooseProgram = (programId: string) => {
    const branch = branchOf(programId)
    update(branch ? { programId, locationId: branch } : { programId })
  }

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    if (sendingRef.current || underage) return
    setBanner(null)

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setBanner(OFFLINE_MESSAGE)
      return
    }

    const found = validateEnquiry(form)
    const first = firstErrorField(found)
    if (first) {
      setErrors(found)
      focusNext.current = first
      return
    }

    sendingRef.current = true
    setSending(true)
    const outcome = await submitEnquiry(org.username, buildEnquiryPayload(form), { anonymous })
    sendingRef.current = false
    setSending(false)

    switch (outcome.kind) {
      case "sent": {
        blurActiveInput()
        const snapshot = sentSnapshot(form, { programs, locations })
        // Reset in memory; nothing about it is kept anywhere else.
        setForm(emptyEnquiry({ viewerName }))
        setErrors({})
        setPhase({ kind: "sent", enquiry: outcome.enquiry, snapshot })
        return
      }
      case "guardian_needed":
        setForm((current) => switchToChild(current))
        setErrors({})
        setGuardianNote(outcome.message || UNDERAGE_NOTE)
        focusNext.current = "guardianName"
        return
      case "too_many":
        setBanner(outcome.message || TOO_MANY_MESSAGE)
        return
      case "invalid": {
        const { fields, rest } = serverFieldErrors(outcome.errors, form.forWhom)
        setErrors(fields)
        if (rest.length > 0 || !firstErrorField(fields)) setBanner(rest[0] || outcome.message || FAILED_MESSAGE)
        focusNext.current = firstErrorField(fields)
        return
      }
      case "closed":
        blurActiveInput()
        setPhase({ kind: "closed" })
        return
      case "throttled":
        setBanner(THROTTLED_MESSAGE)
        return
      case "network":
        setBanner(NETWORK_MESSAGE)
        return
      case "failed":
        setBanner(outcome.message || FAILED_MESSAGE)
        return
    }
  }

  const firstError = firstErrorField(errors)
  const child = form.forWhom === "child"

  return (
    <>
      {guard}
      <Portal>
        <div
          className={styles.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) requestClose()
          }}
        >
          <div
            ref={sheetRef}
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className={styles.header}>
              <Avatar src={org.logo || undefined} initials={initialsOf(org.name)} size="sm" />
              <div className={styles.titles}>
                <h2 id={titleId} className={styles.title}>
                  {phase.kind === "sent" ? "Enquiry sent" : "Enquire"}
                </h2>
                <p className={styles.orgName}>{org.name}</p>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={requestClose}
                disabled={sending}
                aria-label="Close"
              >
                <Icon icon="mdi:close" width={22} height={22} aria-hidden="true" />
              </button>
            </div>

            {phase.kind === "sent" && (
              <div className={styles.body}>
                <EnquirySentView
                  org={org}
                  noun={noun}
                  enquiry={phase.enquiry}
                  snapshot={phase.snapshot}
                  whatsapp={page.contact?.whatsapp ?? null}
                  anonymous={anonymous}
                  headingRef={phaseHeadingRef}
                  onDone={close}
                />
              </div>
            )}

            {phase.kind === "closed" && (
              <div className={`${styles.body} ${styles.closedBody}`}>
                <Icon icon="mdi:inbox-remove-outline" width={40} height={40} aria-hidden="true" className={styles.closedIcon} />
                <h3 ref={phaseHeadingRef} tabIndex={-1} className={styles.closedTitle}>
                  {CLOSED_MESSAGE}
                </h3>
                <Button variant="outline" onClick={close}>
                  Close
                </Button>
              </div>
            )}

            {phase.kind === "form" && (
              <form className={styles.form} onSubmit={send} noValidate>
                <div ref={bodyRef} className={styles.body}>
                  <div className={styles.fields}>
                    <div className={styles.group}>
                      <span id={`${baseId}-who`} className={styles.groupLabel}>
                        Who is this for?
                      </span>
                      <PageSegmented
                        options={WHO_OPTIONS}
                        value={form.forWhom}
                        onChange={chooseWho}
                        labelledBy={`${baseId}-who`}
                      />
                    </div>

                    {child ? (
                      <>
                        {guardianNote && (
                          <p className={styles.note}>
                            <Icon icon="mdi:account-child-outline" width={18} height={18} aria-hidden="true" />
                            <span>{guardianNote}</span>
                          </p>
                        )}
                        <div className={styles.pair}>
                          <PageTextField
                            id={fieldId("childName")}
                            label="Child's name"
                            value={form.childName}
                            onChange={(event) => update({ childName: event.target.value })}
                            error={errors.childName}
                            autoComplete="off"
                            maxLength={80}
                          />
                          <PageTextField
                            id={fieldId("childAge")}
                            label="Child's age"
                            value={form.childAge}
                            onChange={(event) => update({ childAge: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                            error={errors.childAge}
                            inputMode="numeric"
                            autoComplete="off"
                            className={styles.ageInput}
                          />
                        </div>
                        <PageTextField
                          id={fieldId("guardianName")}
                          label="Your name (parent or guardian)"
                          value={form.guardianName}
                          onChange={(event) => update({ guardianName: event.target.value })}
                          error={errors.guardianName}
                          autoComplete="name"
                          maxLength={80}
                        />
                      </>
                    ) : (
                      <>
                        <div className={styles.pair}>
                          <PageTextField
                            id={fieldId("selfName")}
                            label="Your name"
                            value={form.selfName}
                            onChange={(event) => update({ selfName: event.target.value })}
                            error={errors.selfName}
                            autoComplete="name"
                            maxLength={80}
                          />
                          <PageTextField
                            id={fieldId("selfAge")}
                            label="Your age"
                            value={form.selfAge}
                            onChange={(event) => update({ selfAge: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                            error={errors.selfAge}
                            inputMode="numeric"
                            autoComplete="off"
                            className={styles.ageInput}
                            // Only while the note shows: an undefined here would
                            // replace the field's own error link.
                            {...(underage ? { "aria-describedby": `${baseId}-underage` } : {})}
                          />
                        </div>
                        {underage && (
                          <div id={`${baseId}-underage`} className={styles.note} role="status">
                            <Icon icon="mdi:account-child-outline" width={18} height={18} aria-hidden="true" />
                            <div className={styles.noteText}>
                              <span>{UNDERAGE_NOTE}</span>
                              <button
                                type="button"
                                className={styles.noteButton}
                                onClick={moveToChild}
                                {...keepFocusProps}
                              >
                                Switch to My child
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {programs.length > 0 && (
                      <Select
                        id={fieldId("programId")}
                        label="Program (optional)"
                        sheetTitle="Program"
                        value={form.programId}
                        onChange={chooseProgram}
                        error={errors.programId}
                        options={[
                          { value: "", label: "Not sure yet" },
                          ...programs.map((program) => ({ value: program.id, label: programOptionLabel(program) })),
                        ]}
                      />
                    )}

                    {locations.length > 1 && (
                      <Select
                        id={fieldId("locationId")}
                        label="Branch (optional)"
                        sheetTitle="Branch"
                        value={form.locationId}
                        onChange={(locationId) => update({ locationId })}
                        error={errors.locationId}
                        options={[
                          { value: "", label: "Not sure yet" },
                          ...locations.map((location) => ({
                            value: location.id,
                            label: [location.name, location.city].filter(Boolean).join(" · ") || "Branch",
                          })),
                        ]}
                      />
                    )}

                    <div className={styles.group}>
                      <PageTextField
                        id={fieldId("phone")}
                        label="Phone number"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="98765 43210"
                        value={form.phone}
                        onChange={(event) => update({ phone: event.target.value })}
                        error={errors.phone}
                        hint={`Only ${org.name} sees it.`}
                        maxLength={20}
                      />
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={form.whatsapp}
                          onChange={(event) => update({ whatsapp: event.target.checked })}
                        />
                        <span>This number is on WhatsApp</span>
                      </label>
                    </div>

                    <PageTextField
                      id={fieldId("email")}
                      label="Email (optional)"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={form.email}
                      onChange={(event) => update({ email: event.target.value })}
                      error={errors.email}
                      maxLength={254}
                    />

                    <div className={styles.group} role="group" aria-labelledby={`${baseId}-time`}>
                      <span id={`${baseId}-time`} className={styles.groupLabel}>
                        Best time to call
                      </span>
                      <div className={styles.chips}>
                        {BEST_TIMES.map((time, index) => {
                          const chosen = form.bestTime === time.value
                          return (
                            <button
                              key={time.value}
                              id={index === 0 ? fieldId("bestTime") : undefined}
                              type="button"
                              className={`${styles.chip} ${chosen ? styles.chipChosen : ""}`}
                              aria-pressed={chosen}
                              onClick={() => update({ bestTime: chosen ? "" : time.value })}
                              {...keepFocusProps}
                            >
                              {chosen && <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />}
                              {time.label}
                            </button>
                          )
                        })}
                      </div>
                      {errors.bestTime && <FieldError>{errors.bestTime}</FieldError>}
                    </div>

                    <PageTextArea
                      id={fieldId("message")}
                      label="Anything to add? (optional)"
                      value={form.message}
                      onChange={(event) => update({ message: event.target.value.slice(0, MESSAGE_MAX) })}
                      error={errors.message}
                      rows={3}
                      maxLength={MESSAGE_MAX}
                      aside={
                        <span className={styles.counter} aria-hidden="true">
                          {form.message.length}/{MESSAGE_MAX}
                        </span>
                      }
                    />

                    {/* The honeypot: off screen, out of the tab order and hidden
                        from assistive tech. A person never fills it; a bot that
                        fills every field does, and what it holds is sent. */}
                    <div className={styles.honeypot} aria-hidden="true">
                      <label htmlFor={`${baseId}-website`}>Website</label>
                      <input
                        id={`${baseId}-website`}
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(event) => update({ website: event.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.footer}>
                  <div role="alert" className={banner ? styles.banner : undefined}>
                    {banner && (
                      <>
                        <Icon icon="mdi:alert-circle-outline" width={18} height={18} aria-hidden="true" />
                        <span>{banner}</span>
                      </>
                    )}
                  </div>
                  <span className="sr-only" aria-live="polite">
                    {firstError ? errors[firstError] : ""}
                  </span>
                  <Button
                    type="submit"
                    variant="brand"
                    fullWidth
                    loading={sending}
                    disabled={underage}
                    aria-describedby={underage ? `${baseId}-underage` : undefined}
                    className={styles.send}
                    {...keepFocusProps}
                  >
                    {sending ? "Sending…" : "Send enquiry"}
                  </Button>
                  <p className={styles.footnote}>
                    Only {org.name} sees these details. No Goatza account needed.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={confirmingClose}
          title="Discard this enquiry?"
          message="You'll lose what you've typed."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          tone="danger"
          onConfirm={() => {
            setConfirmingClose(false)
            close()
          }}
          onCancel={() => setConfirmingClose(false)}
        />
      </Portal>
    </>
  )
}
