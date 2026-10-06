"use client"

/**
 * ApplicantDetailDrawer — right-side drawer on desktop, bottom sheet on
 * mobile. The shared contact details, the age check, every custom-question
 * answer, the single status change (only the moves valid at the
 * application's stage, with an optional internal reason) and the
 * application's internal history, plus a link to the public profile.
 */

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { waLink } from "../../whatsapp/waLink"
import { applicantMessage } from "../../whatsapp/whatsappTemplates"
import { useNavigation } from "@/shared/services/navigation.service"
import {
  useApplicationDetail,
  useUpdateApplicationStatus,
} from "../../hooks/useRecruitments"
import {
  CONFIRM_FIRST,
  STATUS_ACTION_DESCRIPTION,
  statusActionLabel,
  statusLabel,
  statusMeta,
  statusTargetsFrom,
} from "../../applicationStatus"
import { birthYearInGroup, formatBirthYears, formatReportingTime } from "../../eligibility"
import type {
  ApplicationAnswer,
  ApplicationStatus,
  ApplicationStatusHistoryEntry,
  RecruitmentAgeCategory,
  RecruitmentTypeValue,
  SingleStatusTarget,
} from "../../services/recruitments.api"
import StatusBadge from "../StatusBadge/StatusBadge"
import StarRating from "../StarRating/StarRating"
import styles from "./ApplicantDetailDrawer.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"

dayjs.extend(relativeTime)

/** History rows shown before "Show all". */
const HISTORY_PREVIEW = 3

// ── Set-status control (org, single change — select-style dropdown) ──

function SetStatusSection({
  applicationId,
  recruitmentId,
  recruitmentType,
  currentStatus,
}: {
  applicationId: string
  recruitmentId: string
  recruitmentType?: RecruitmentTypeValue
  currentStatus: ApplicationStatus
}) {
  const toast = useToast()
  const noteId = useId()
  const [open, setOpen] = useState(false)
  // A "not this time" move waiting on its confirm step.
  const [confirmTarget, setConfirmTarget] = useState<SingleStatusTarget | null>(null)
  // Internal reason — optional on purpose (a forced one gets "." and "..").
  const [note, setNote] = useState("")
  const { mutate: updateStatus, isPending } = useUpdateApplicationStatus()
  const ref = useRef<HTMLDivElement>(null)

  // Only the moves valid at this application's stage.
  const options = statusTargetsFrom(currentStatus)

  // Close the menu on outside click / Escape (drawer-local, not a portal).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmTarget(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setConfirmTarget(null)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const run = (target: SingleStatusTarget) => {
    updateStatus(
      { applicationId, recruitmentId, status: target, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false)
          setConfirmTarget(null)
          setNote("")
          toast.show({
            title: `Status updated to ${statusLabel(target, recruitmentType)}`,
            variant: "success",
          })
        },
        onError: (err) => {
          // The server's own words — the trial-date guards tell the org
          // exactly what to do, and a generic line would throw that away.
          toast.show({
            title: getApiErrorMessage(err, "Couldn't update the status."),
            variant: "error",
          })
        },
      }
    )
  }

  return (
    <section className={styles.section}>
      <p className={styles.sectionTitle}>Status</p>

      <div className={styles.statusSelect} ref={ref}>
        <button
          className={styles.statusTrigger}
          onClick={() => { setOpen((o) => !o); setConfirmTarget(null) }}
          disabled={isPending}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={styles.triggerLabel}>Update status</span>
          <span className={styles.triggerRight}>
            <StatusBadge status={currentStatus} recruitmentType={recruitmentType} />
            <Icon
              icon="mdi:chevron-down"
              width={18}
              height={18}
              className={`${styles.triggerChevron} ${open ? styles.triggerChevronOpen : ""}`}
            />
          </span>
        </button>

        {open && (
          <div className={styles.statusMenu} role="listbox">
            {confirmTarget ? (
              <div className={styles.rejectConfirm} role="alertdialog" aria-label="Confirm status change">
                <p className={styles.rejectConfirmText}>
                  Mark this application &ldquo;{statusLabel(confirmTarget, recruitmentType)}&rdquo;?{" "}
                  {STATUS_ACTION_DESCRIPTION[confirmTarget]}
                </p>
                <div className={styles.rejectConfirmActions}>
                  <button
                    className={styles.rejectCancel}
                    onClick={() => setConfirmTarget(null)}
                    disabled={isPending}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className={styles.rejectConfirmBtn}
                    onClick={() => run(confirmTarget)}
                    disabled={isPending}
                    type="button"
                  >
                    {isPending
                      ? <span className={styles.miniSpinner} aria-hidden="true" />
                      : <Icon icon="mdi:close-circle-outline" width={15} height={15} />}
                    {statusActionLabel(confirmTarget, recruitmentType)}
                  </button>
                </div>
              </div>
            ) : (
              options.map((target) => {
                const meta = statusMeta(target, recruitmentType)
                const isCurrent = currentStatus === target
                return (
                  <button
                    key={target}
                    className={`${styles.statusOption} ${isCurrent ? styles.statusOptionCurrent : ""}`}
                    onClick={() => {
                      if (isCurrent) return
                      if (CONFIRM_FIRST.includes(target)) setConfirmTarget(target)
                      else run(target)
                    }}
                    disabled={isCurrent || isPending}
                    role="option"
                    aria-selected={isCurrent}
                    type="button"
                  >
                    <span className={`${styles.optionIcon} ${styles[meta.colorClass]}`}>
                      <Icon icon={meta.icon} width={18} height={18} />
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>
                        {statusActionLabel(target, recruitmentType)}
                      </span>
                      <span className={styles.optionDesc}>{STATUS_ACTION_DESCRIPTION[target]}</span>
                    </span>
                    {isCurrent && (
                      <Icon icon="mdi:check" width={16} height={16} className={styles.optionCheck} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Prominent, never required. Internal in v1: no player surface — My
          applications, the applicant's status sheet — ever renders it. */}
      <div className={styles.noteField}>
        <label className={styles.noteLabel} htmlFor={noteId}>
          Reason (internal)
        </label>
        <input
          id={noteId}
          className={styles.noteInput}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — saved with the next status change"
          maxLength={1000}
          disabled={isPending}
        />
        <p className={styles.noteHelp}>
          Only your organization sees this. The player never does.
        </p>
      </div>
    </section>
  )
}

// ── Age check ─────────────────────────────────────────────────
// The group they applied under against the LIVE profile birth year, read by
// the same rule the apply modal warned with. Reconciled with the flag frozen
// at apply time, so a corrected profile reads as corrected. Information only —
// nothing here gates anything.

function AgeBlock({
  title,
  reportingTime,
  group,
  storedMismatch,
  birthYear,
}: {
  title: string
  reportingTime: string | null
  /** The recruitment's own row for the group, which carries the band. */
  group?: RecruitmentAgeCategory
  storedMismatch: boolean
  /** Live; null when the applicant has no birthdate on file. */
  birthYear: number | null | undefined
}) {
  const range = group ? formatBirthYears(group.min_birth_year, group.max_birth_year) : ""
  const appliedUnder = range
    ? `${title} (${range.charAt(0).toLowerCase()}${range.slice(1)})`
    : title

  // No birth year → no verdict at all: the desk checks documents rather than
  // assume a match, and a missing year is never shown as a mismatch.
  const known = typeof birthYear === "number"
  const liveMismatch = known && !!group && !birthYearInGroup(group, birthYear)
  const drift =
    known && group
      ? storedMismatch && !liveMismatch
        ? "Was mismatched at apply; the profile has since been corrected."
        : !storedMismatch && liveMismatch
          ? "The profile birth year has changed since this application."
          : null
      : null

  return (
    <section className={styles.section}>
      <p className={styles.sectionTitle}>Age</p>
      <dl className={styles.ageList}>
        <div className={styles.ageRow}>
          <dt className={styles.ageKey}>Applied under</dt>
          <dd className={styles.ageValue}>{appliedUnder}</dd>
        </div>
        {reportingTime && (
          <div className={styles.ageRow}>
            <dt className={styles.ageKey}>Reports at</dt>
            <dd className={styles.ageValue}>{formatReportingTime(reportingTime)}</dd>
          </div>
        )}
        <div className={styles.ageRow}>
          <dt className={styles.ageKey}>Profile birth year</dt>
          <dd className={styles.ageValue}>
            {known ? birthYear : <span className={styles.ageUnset}>not set</span>}
            {liveMismatch && (
              <span className={styles.ageFlag}>
                <Icon icon="mdi:alert-outline" width={13} height={13} />
                outside this group
              </span>
            )}
          </dd>
        </div>
      </dl>
      {drift && (
        <p className={styles.ageDrift}>
          <Icon icon="mdi:information-outline" width={13} height={13} />
          {drift}
        </p>
      )}
    </section>
  )
}

// ── History (internal) ────────────────────────────────────────

// Moves the applicant makes themselves carry no org member; everything else
// without one was written automatically (the data migration, and later the
// auto-confirm). Only those read "automatic".
const APPLICANT_MOVES: ApplicationStatus[] = ["applied", "withdrawn"]

function HistoryTimeline({
  entries,
  recruitmentType,
}: {
  entries: ApplicationStatusHistoryEntry[]
  recruitmentType?: RecruitmentTypeValue
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? entries : entries.slice(0, HISTORY_PREVIEW)
  const hidden = entries.length - shown.length

  return (
    <section className={styles.section}>
      <p className={styles.sectionTitle}>History (internal)</p>
      <ol className={styles.history}>
        {shown.map((entry) => {
          const by = entry.changed_by
            ? `by ${entry.changed_by.name}`
            : APPLICANT_MOVES.includes(entry.to_status)
              ? null
              : "automatic"
          return (
            <li key={entry.id} className={styles.historyItem}>
              <span className={styles.historyLine}>
                <strong className={styles.historyStatus}>
                  {statusLabel(entry.to_status, recruitmentType)}
                </strong>
                {" · "}
                {dayjs(entry.created_at).format("D MMM, h:mm A")}
                {by && <>{" · "}{by}</>}
              </span>
              {entry.note.trim() && (
                <q className={styles.historyNote}>{entry.note.trim()}</q>
              )}
            </li>
          )
        })}
      </ol>
      {entries.length > HISTORY_PREVIEW && (
        <button
          type="button"
          className={styles.historyToggle}
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
        >
          {showAll ? "Show less" : `Show all (${hidden} more)`}
        </button>
      )}
    </section>
  )
}

function AnswerBlock({ answer }: { answer: ApplicationAnswer }) {
  const hasOptions = answer.selected_options.length > 0
  const hasText = answer.answer_text.trim().length > 0
  return (
    <div className={styles.answerBlock}>
      <p className={styles.answerQuestion}>{answer.question}</p>
      {hasOptions ? (
        <div className={styles.chips}>
          {answer.selected_options.map((value, i) => (
            <span key={i} className={styles.answerChip}>{value}</span>
          ))}
        </div>
      ) : hasText ? (
        <p className={styles.answerText}>{answer.answer_text}</p>
      ) : (
        <p className={styles.answerEmpty}>No answer</p>
      )}
    </div>
  )
}

interface ApplicantDetailDrawerProps {
  applicationId: string
  recruitmentId: string
  /** Picks the per-type wording ("Invite to trial" vs "Confirm for trial"). */
  recruitmentType?: RecruitmentTypeValue
  /** The recruitment's groups — the application row names its group but not
   *  the band, so the age check looks the band up here. */
  ageCategories?: RecruitmentAgeCategory[]
  /** For the WhatsApp fallback's message body. */
  recruitmentTitle?: string
  orgName?: string
  onClose: () => void
}

export default function ApplicantDetailDrawer({
  applicationId,
  recruitmentId,
  recruitmentType,
  ageCategories = [],
  recruitmentTitle,
  orgName,
  onClose,
}: ApplicantDetailDrawerProps) {
  const { toProfile } = useNavigation()
  const { data, isLoading, isError } = useApplicationDetail(applicationId)

  // Scroll lock + Escape to close.
  useBodyScrollLock()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const applicant = data?.applicant
  const history = data?.status_history ?? []

  // Portal to <body> so the fixed backdrop/drawer escapes any ancestor
  // containing block (transformed wrappers) and covers the full viewport.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Applicant details"
    >
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Avatar
              src={applicant?.avatar}
              initials={(data?.shared_name || applicant?.name)?.slice(0, 2).toUpperCase()}
              size="md"
            />
            <div className={styles.headerText}>
              <span className={styles.headerName}>{data?.shared_name || applicant?.name || "Applicant"}</span>
              {applicant?.username && <span className={styles.headerUsername}>@{applicant.username}</span>}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Loading application…</span>
            </div>
          ) : isError || !data ? (
            <div className={styles.errorState}>
              <Icon icon="mdi:alert-circle-outline" width={28} height={28} />
              <p>Failed to load this application.</p>
            </div>
          ) : (
            <>
              {/* Status + applied time */}
              <div className={styles.statusRow}>
                <StatusBadge status={data.status} recruitmentType={recruitmentType} />
                <span className={styles.appliedAt}>
                  <Icon icon="mdi:clock-outline" width={13} height={13} />
                  Applied {dayjs(data.applied_at).fromNow()}
                </span>
              </div>

              {/* Shared contact */}
              <section className={styles.section}>
                <p className={styles.sectionTitle}>Contact shared</p>
                <div className={styles.contactList}>
                  <div className={styles.contactRow}>
                    <Icon icon="mdi:account-outline" width={16} height={16} className={styles.contactIcon} />
                    <span className={styles.contactValue}>{data.shared_name}</span>
                  </div>
                  {data.shared_email ? (
                    <a className={styles.contactRow} href={`mailto:${data.shared_email}`}>
                      <Icon icon="mdi:email-outline" width={16} height={16} className={styles.contactIcon} />
                      <span className={styles.contactLink}>{data.shared_email}</span>
                    </a>
                  ) : null}
                  {data.shared_phone ? (
                    <a className={styles.contactRow} href={`tel:${data.shared_phone}`}>
                      <Icon icon="mdi:phone-outline" width={16} height={16} className={styles.contactIcon} />
                      <span className={styles.contactLink}>{data.shared_phone}</span>
                    </a>
                  ) : null}
                </div>

                {/* GOATZA FIRST, WHATSAPP SECOND. Not a style choice: a
                    Goatza message keeps the conversation where both sides can
                    find it and where the org does not need the player's phone
                    number. WhatsApp is the fallback for someone who has not
                    opened the app, and the order is what says so. */}
                <div className={styles.contactActions}>
                  <Link className={styles.contactPrimary} href="/messages">
                    <Icon icon="mdi:message-text-outline" width={15} height={15} />
                    Message on Goatza
                  </Link>
                  <a
                    className={styles.contactSecondary}
                    href={waLink(
                      data.shared_phone,
                      applicantMessage({
                        playerName: data.shared_name || data.applicant.name,
                        orgName: orgName ?? "",
                        recruitmentTitle: recruitmentTitle ?? "the trial",
                        url:
                          typeof window === "undefined"
                            ? ""
                            : `${window.location.origin}/recruitments/${recruitmentId ?? ""}`,
                      }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Message on WhatsApp"
                    title="Message on WhatsApp"
                  >
                    <Icon icon="mdi:whatsapp" width={16} height={16} />
                  </a>
                </div>
              </section>

              {/* The age group they applied under, with its reporting time —
                  the detail the org calls them about — and the age check.
                  Absent when the recruitment has no groups, or the group was
                  later deleted. */}
              {data.age_category && (
                <AgeBlock
                  title={data.age_category.title}
                  reportingTime={data.age_category.reporting_time}
                  group={ageCategories.find((g) => g.id === data.age_category?.id)}
                  storedMismatch={!!data.age_mismatch_at_apply}
                  birthYear={data.applicant_birth_year}
                />
              )}

              {/* Answers */}
              {data.answers.length > 0 && (
                <section className={styles.section}>
                  <p className={styles.sectionTitle}>Application answers</p>
                  <div className={styles.answerList}>
                    {data.answers.map((answer, i) => (
                      <AnswerBlock key={i} answer={answer} />
                    ))}
                  </div>
                </section>
              )}

              {/* WHAT THE PLAYER SAID. Rendered only once they have answered
                  (`feedback_at`), so an org never sees an empty shell of a
                  section on the 90% of rows with no answer.

                  It is a CLAIM, not a status: the wording says "Says they
                  were", and the status controls below are still the only
                  thing that decides anything. */}
              {data.feedback_at && (
                <section className={styles.section}>
                  <div className={styles.feedbackHead}>
                    <p className={styles.sectionTitle}>Player&apos;s feedback</p>
                    <span className={styles.feedbackDate}>
                      {dayjs(data.feedback_at).format("D MMM")}
                    </span>
                  </div>

                  <p className={styles.feedbackClaim}>
                    {data.attended_self_reported === false
                      ? "Said they couldn't make it"
                      : [
                          "Went to the trial",
                          data.outcome_self_reported === "selected"
                            ? "Says they were selected"
                            : data.outcome_self_reported === "not_selected"
                              ? "Says they weren't selected"
                              : data.outcome_self_reported === "waiting"
                                ? "Still waiting to hear"
                                : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>

                  {/* The SAME star component, in display mode — a second
                      read-only copy is how the two drift apart. */}
                  {data.trial_rating != null && (
                    <StarRating
                      value={data.trial_rating}
                      label={`Rated ${data.trial_rating} out of 5`}
                      size="sm"
                    />
                  )}

                  {data.trial_feedback && (
                    <blockquote className={styles.feedbackQuote}>
                      {data.trial_feedback}
                    </blockquote>
                  )}

                  <p className={styles.feedbackPrivacy}>
                    Only your organization sees this.
                  </p>
                </section>
              )}

              {/* Status controls — hidden entirely once withdrawn */}
              {data.status === "withdrawn" ? (
                <p className={styles.withdrawnNote}>
                  <Icon icon="mdi:undo-variant" width={15} height={15} />
                  This applicant withdrew their application.
                </p>
              ) : (
                <SetStatusSection
                  applicationId={applicationId}
                  recruitmentId={recruitmentId}
                  recruitmentType={recruitmentType}
                  currentStatus={data.status}
                />
              )}

              {/* Public profile link */}
              {applicant?.username && (
                <Link
                  href={toProfile(applicant.username, "user")}
                  className={styles.profileLink}
                >
                  <Icon icon="mdi:account-circle-outline" width={17} height={17} />
                  View public profile
                  <Icon icon="mdi:arrow-right" width={15} height={15} className={styles.profileArrow} />
                </Link>
              )}

              {/* The org's own record of every move, with its reasons. */}
              {history.length > 0 && (
                <HistoryTimeline entries={history} recruitmentType={recruitmentType} />
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
