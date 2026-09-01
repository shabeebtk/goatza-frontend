"use client"

/**
 * "Report a problem" — the app is broken, not somebody's behaviour.
 *
 * Built on the same skeleton as moderation's ReportSheet (portal, body scroll
 * lock, Escape and backdrop to close, three steps in ONE sheet) because the two
 * are reached from adjacent places and should feel like the same surface. What
 * is copied is the interaction model; nothing else about the two is the same.
 *
 *   1. CATEGORY — a radio list. Picking one advances immediately; a
 *      single-choice list with a confirm button is one tap of ceremony for no
 *      decision.
 *   2. DETAILS  — a REQUIRED description (this is the whole report), optional
 *      screenshots, and a plain statement of what gets attached automatically.
 *   3. DONE     — the thank-you and the reference code, which is the only time
 *      anyone will ever see it.
 *
 * TWO THINGS THAT ARE NOT DECORATION:
 *
 *   - The "Reporting a person or post?" line under step 1. Without it,
 *     harassment reports land in the bug queue and sit there unanswered, which
 *     is the worst possible outcome for the person who filed one.
 *   - The "attached automatically" note in step 2. We collect the page, the
 *     viewport, the platform and the app version. Telling people that where
 *     they can read it is cheaper than them finding out later.
 *
 * Screenshots UPLOAD ON SELECTION, not on Send. Somebody filing a bug report is
 * already annoyed; making them watch three transfers after they press the
 * button is the wrong moment to spend their patience.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { isUploadCancelled } from "@/shared/services/mediaUpload"

import { useSubmitProblemReport } from "../../hooks/useSupportQueries"
import { PROBLEM_CATEGORIES } from "../../reportProblemMeta"
import { buildClientContext } from "../../services/clientContext"
import {
  MAX_SCREENSHOTS,
  uploadScreenshot,
  validateScreenshot,
} from "../../services/screenshotUpload"
import type {
  ProblemCategory,
  ProblemScreenshot,
} from "../../services/support.api"
import styles from "./ProblemReportSheet.module.css"

export interface ProblemReportSheetProps {
  /**
   * Opens the abuse-reporting flow instead — see the "Reporting a person or
   * post?" line below.
   *
   * Optional because most hosts have no target to report: moderation's
   * ReportSheet is always ABOUT something (a post, a comment, an account), and
   * Settings is reached from nothing in particular. Where a host can supply
   * one it passes this and gets a real link; where it cannot, the line still
   * appears and points at the ⋯ menu, which is where the target exists.
   */
  onReportAbuse?: () => void
  onClose: () => void
}

type Step = "category" | "details" | "done"

/** Mirrors the backend's MIN/MAX_DESCRIPTION_LENGTH. */
const MIN_DESCRIPTION = 15
const MAX_DESCRIPTION = 2000

/** One picked screenshot, from selection through to its stored pair. */
type Attachment = {
  /** Local id — the list is keyed by it, since two files can share a name. */
  id: string
  /** Object URL for the thumbnail. Revoked when the attachment goes away. */
  preview: string
  /** 0–100 while uploading. */
  progress: number
  /** Set once the bytes are in the bucket; this is what gets sent. */
  uploaded?: ProblemScreenshot
  failed?: boolean
}

export default function ProblemReportSheet({
  onReportAbuse,
  onClose,
}: ProblemReportSheetProps) {
  const submit = useSubmitProblemReport()
  const toast = useToast()

  const backdropRef = useRef<HTMLDivElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>("category")
  const [category, setCategory] = useState<ProblemCategory | null>(null)
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [reference, setReference] = useState("")

  // Lock body scroll while open — same as ReportSheet / PostOptionsSheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  useEffect(() => {
    if (step === "details") descriptionRef.current?.focus()
  }, [step])

  // Object URLs are a leak if nobody revokes them. Keyed off a ref rather than
  // the state array so the cleanup runs on unmount with whatever was current,
  // not with a stale closure over an early render's list.
  const attachmentsRef = useRef<Attachment[]>([])
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])
  useEffect(
    () => () => {
      for (const item of attachmentsRef.current) {
        URL.revokeObjectURL(item.preview)
      }
    },
    []
  )

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const pickCategory = (value: ProblemCategory) => {
    setCategory(value)
    setStep("details")
  }

  const selectedLabel = useMemo(
    () => PROBLEM_CATEGORIES.find((c) => c.value === category)?.label ?? "",
    [category]
  )

  // ── Screenshots ────────────────────────────────────────────

  const uploading = attachments.some((item) => !item.uploaded && !item.failed)
  const slotsLeft = MAX_SCREENSHOTS - attachments.length

  const patch = (id: string, next: Partial<Attachment>) =>
    setAttachments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...next } : item))
    )

  const removeAttachment = (id: string) =>
    setAttachments((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((item) => item.id !== id)
    })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return

    // Silently taking the first three of five would look like the picker
    // dropped files at random, so the cap is stated.
    const picked = Array.from(files).slice(0, Math.max(slotsLeft, 0))

    if (files.length > picked.length) {
      toast.show({
        title: `You can attach up to ${MAX_SCREENSHOTS} screenshots`,
        variant: "warning",
        position: "top-right",
        duration: 4000,
      })
    }

    for (const file of picked) {
      const problem = validateScreenshot(file)

      if (problem) {
        toast.show({
          title: problem,
          variant: "warning",
          position: "top-right",
          duration: 4000,
        })
        continue
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

      setAttachments((current) => [
        ...current,
        { id, preview: URL.createObjectURL(file), progress: 0 },
      ])

      // Fire and forget: the thumbnail carries its own progress, so nothing
      // above it has to wait, and a failure marks one tile rather than the
      // whole sheet.
      uploadScreenshot(file, (loaded, total) =>
        patch(id, { progress: total ? Math.round((loaded / total) * 100) : 0 })
      )
        .then((uploaded) => patch(id, { uploaded, progress: 100 }))
        .catch((err: unknown) => {
          if (isUploadCancelled(err)) return

          patch(id, { failed: true })
          toast.show({
            title: "Couldn't attach that screenshot",
            message: "You can send the report without it.",
            variant: "error",
            position: "top-right",
            duration: 4000,
          })
        })
    }
  }

  // ── Submit ─────────────────────────────────────────────────

  const send = () => {
    const text = description.trim()

    // Validation is INLINE and the button stays enabled. A disabled Send with
    // no explanation is the version of this where somebody types four words,
    // taps a dead button and gives up.
    if (text.length < MIN_DESCRIPTION) {
      setError(
        `Tell us a little more — at least ${MIN_DESCRIPTION} characters.`
      )
      descriptionRef.current?.focus()
      return
    }

    if (!category) return

    // Only the ones that actually landed. A failed tile is not sent, and its
    // toast already said the report can go without it.
    const screenshots = attachments
      .map((item) => item.uploaded)
      .filter((item): item is ProblemScreenshot => Boolean(item))

    submit.mutate(
      {
        category,
        description: text,
        ...(screenshots.length ? { screenshots } : {}),
        client_context: buildClientContext(),
      },
      {
        onSuccess: (result) => {
          setReference(result.reference)
          setStep("done")
        },
        // On failure the sheet stays on step 2 with the error toast over it, so
        // Send is still one tap away rather than needing the whole journey
        // again. Same rule ReportSheet follows.
      }
    )
  }

  const busy = submit.isPending

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="problem-report-title"
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />

        {/* ── Step 1: category ── */}
        {step === "category" && (
          <>
            <header className={styles.header}>
              <h3 id="problem-report-title" className={styles.title}>
                Report a problem
              </h3>
              <p className={styles.subtitle}>What went wrong?</p>
            </header>

            <div
              className={styles.options}
              role="radiogroup"
              aria-label="What kind of problem is this?"
            >
              {PROBLEM_CATEGORIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  className={styles.option}
                  onClick={() => pickCategory(option.value)}
                >
                  <span className={styles.radio} aria-hidden="true">
                    {category === option.value && (
                      <span className={styles.radioDot} />
                    )}
                  </span>
                  <span className={styles.optionLabel}>{option.label}</span>
                  <Icon
                    icon="mdi:chevron-right"
                    width={18}
                    height={18}
                    className={styles.optionChevron}
                  />
                </button>
              ))}
            </div>

            {/* The other queue. This sheet files BUGS; a report about a person
                or a post belongs to moderation, and one filed here would sit
                unanswered in the wrong place. */}
            <div className={styles.crossLink}>
              <span className={styles.crossLinkText}>
                Reporting a person or post?
              </span>
              {onReportAbuse ? (
                <button
                  type="button"
                  className={styles.crossLinkBtn}
                  onClick={() => {
                    onClose()
                    onReportAbuse()
                  }}
                >
                  Report abuse instead
                </button>
              ) : (
                // No target to report from here — see the prop's comment. The
                // sentence still has to point somewhere, so it points at the
                // menu where the target exists.
                <span className={styles.crossLinkHint}>
                  Use the ⋯ menu on their profile, post or message.
                </span>
              )}
            </div>

            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
          </>
        )}

        {/* ── Step 2: details ── */}
        {step === "details" && (
          <>
            <header className={styles.header}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setStep("category")}
                aria-label="Back to problem types"
                disabled={busy}
              >
                <Icon icon="mdi:chevron-left" width={20} height={20} />
              </button>
              <h3 id="problem-report-title" className={styles.title}>
                {selectedLabel}
              </h3>
              <p className={styles.subtitle}>
                What happened, and what were you doing at the time?
              </p>
            </header>

            <div className={styles.body}>
              <textarea
                ref={descriptionRef}
                className={`${styles.textarea} ${error ? styles.textareaError : ""}`}
                placeholder="The upload spinner never stops when I add a photo to a post…"
                value={description}
                maxLength={MAX_DESCRIPTION}
                rows={5}
                onChange={(e) => {
                  setDescription(e.target.value)
                  // Clear on edit: an error that stays put while somebody is
                  // fixing it reads as a field that is stuck.
                  if (error) setError("")
                }}
                disabled={busy}
                aria-invalid={Boolean(error)}
                aria-describedby="problem-report-counter"
              />

              <div className={styles.meta}>
                {error ? (
                  <span className={styles.error} role="alert">
                    {error}
                  </span>
                ) : (
                  <span />
                )}
                <span id="problem-report-counter" className={styles.counter}>
                  {description.trim().length}/{MAX_DESCRIPTION}
                </span>
              </div>

              {/* ── Screenshots ── */}
              <div className={styles.shots}>
                {attachments.map((item) => (
                  <div key={item.id} className={styles.shot}>
                    {/* A local object URL of a file the user just picked —
                        next/image would gain nothing and cannot optimise it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.preview}
                      alt="Screenshot to attach"
                      className={styles.shotImg}
                    />

                    {!item.uploaded && !item.failed && (
                      <span className={styles.shotProgress} aria-hidden="true">
                        <span
                          className={styles.shotProgressBar}
                          style={{ width: `${item.progress}%` }}
                        />
                      </span>
                    )}

                    {item.failed && (
                      <span className={styles.shotFailed} aria-hidden="true">
                        <Icon icon="mdi:alert-circle-outline" width={18} height={18} />
                      </span>
                    )}

                    <button
                      type="button"
                      className={styles.shotRemove}
                      onClick={() => removeAttachment(item.id)}
                      aria-label="Remove screenshot"
                      disabled={busy}
                    >
                      <Icon icon="mdi:close" width={14} height={14} />
                    </button>
                  </div>
                ))}

                {slotsLeft > 0 && (
                  <button
                    type="button"
                    className={styles.shotAdd}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    <Icon icon="mdi:image-plus-outline" width={20} height={20} />
                    <span className={styles.shotAddLabel}>Screenshot</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    handleFiles(e.target.files)
                    // Reset, or picking the same file twice in a row is a
                    // change event that never fires.
                    e.target.value = ""
                  }}
                />
              </div>

              {/* Say what we take. Not a control — there is nothing to opt out
                  of, and pretending otherwise would be worse than saying so. */}
              <p className={styles.autoNote}>
                <Icon icon="mdi:information-outline" width={15} height={15} />
                Attached automatically: page, device, browser, app version
              </p>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={send}
                // Never disabled by validation — only while the request is in
                // flight, where a second tap would file a second report.
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Sending…
                  </>
                ) : uploading ? (
                  "Send anyway"
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: done ── */}
        {step === "done" && (
          <div className={styles.done}>
            <span className={styles.doneMark} aria-hidden="true">
              <Icon icon="mdi:check" width={26} height={26} />
            </span>

            <h3 id="problem-report-title" className={styles.title}>
              Thanks — we got it
            </h3>
            <p className={styles.text}>
              Our team will look into this, and may email you if we need more
              to go on.
            </p>

            {/* Monospace, and the only place this code is ever shown. It is for
                quoting in a reply — there is deliberately no page that looks
                one up. */}
            <p className={styles.reference}>{reference}</p>

            <div className={styles.doneActions}>
              <button type="button" className={styles.doneBtn} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
