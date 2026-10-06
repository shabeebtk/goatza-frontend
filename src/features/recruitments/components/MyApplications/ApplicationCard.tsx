"use client"

import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import { formatReportingTime } from "../../eligibility"
import { playerStatusMeta } from "../../applicationStatus"
import { FALLBACK_TRIAL_TIME_ZONE, isTrialOver, trialDay } from "../../trialEnded"
import {
  formatSessionDate,
  formatSessionTimeRange,
  sessionPlace,
} from "../../sessionDisplay"
import AnnouncementList from "../AnnouncementList/AnnouncementList"
import TrialFeedbackPrompt from "../TrialFeedback/TrialFeedbackPrompt"
import type {
  ApplicationStatus,
  MyApplicationListItem,
} from "../../services/recruitments.api"
import styles from "./ApplicationCard.module.css"

// ── Status tone ───────────────────────────────────────────────

/**
 * THE STATUS IS WHY THIS TAB IS OPEN, so it is the first thing on the card
 * and it is the thing that colours it. Previously it was a small badge in a
 * corner, which is the least prominent place on a card for the only fact the
 * card exists to carry.
 *
 * Five tones, and the two that mean "something good happened" are the only
 * ones that reach for brand green:
 *
 *   confirmed  you are going — green, and the card's own border takes it up
 *   selected   you are in — the same green, stronger
 *   review     being looked at — amber, the "in motion" colour
 *   neutral    filed, nothing has happened yet
 *   muted      finished, and not in your favour, or withdrawn. No tint: a
 *              red card for "not shortlisted" is a punishment, not a status.
 */
type Tone = "confirmed" | "selected" | "review" | "neutral" | "muted"

/**
 * KEYED BY STRING, not by ApplicationStatus — the same reason
 * PLAYER_OVERRIDES is: `rejected` and `invited` are out of the union but a
 * pre-backfill row still carries one, and an unknown status falling through
 * to "neutral" is right.
 *
 * `reviewing` and `shortlisted` share a tone because the org's shortlist is
 * PRIVATE: the label already reads "Under review" for both, and a different
 * colour would give away what the label carefully does not.
 */
const TONE_BY_STATUS: Record<string, Tone> = {
  applied: "neutral",
  reviewing: "review",
  shortlisted: "review",
  trial_confirmed: "confirmed",
  selected: "selected",
  not_shortlisted: "muted",
  not_selected: "muted",
  rejected: "muted",
  withdrawn: "muted",
}

const TONE_CLASS: Record<Tone, string> = {
  confirmed: "toneConfirmed",
  selected: "toneSelected",
  review: "toneReview",
  neutral: "toneNeutral",
  muted: "toneMuted",
}

// ── The contextual line ───────────────────────────────────────

/**
 * Whole days from today to `dateIso`, on the venue's calendar.
 *
 * Both days are pinned to UTC noon before the subtraction so the answer is a
 * count of CALENDAR days and cannot be knocked a day out by the reader's own
 * clock or by a DST boundary between the two. `trialDay` first, in the
 * recruitment's own zone: "Tomorrow" has to mean tomorrow at the ground.
 */
function daysUntil(
  dateIso: string | null | undefined,
  timeZone: string,
  now: Date | number = Date.now()
): number | null {
  if (!dateIso) return null
  const day = trialDay(dateIso, timeZone)
  const today = trialDay(now, timeZone)
  if (!day || !today) return null
  const then = new Date(`${day}T12:00:00Z`).getTime()
  const from = new Date(`${today}T12:00:00Z`).getTime()
  if (Number.isNaN(then) || Number.isNaN(from)) return null
  return Math.round((then - from) / 86_400_000)
}

/** "Today" / "Tomorrow" / "in 4 days". Null once the day has passed. */
function countdownLabel(days: number | null): string | null {
  if (days === null || days < 0) return null
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return `in ${days} days`
}

// ── Actions ───────────────────────────────────────────────────

/**
 * An action row ONLY where there is something to do. A row of buttons on a
 * finished application is noise on every card in the list — and the title is
 * a link either way, so nothing becomes unreachable by leaving it off.
 */
function hasActions(status: ApplicationStatus): boolean {
  return status === "trial_confirmed" || status === "selected"
}

interface ApplicationCardProps {
  application: MyApplicationListItem
}

export default function ApplicationCard({ application }: ApplicationCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const r = application.recruitment

  // THE VENUE's calendar, off the recruitment this application is for. Every
  // date on this card is read in it — a player who applied to a London trial
  // must not see its day on their own clock.
  const timeZone = r.timezone || FALLBACK_TRIAL_TIME_ZONE

  const meta = playerStatusMeta(application.status, r.recruitment_type)
  const tone = TONE_BY_STATUS[application.status] ?? "neutral"

  // The group they applied under, and when it reports — the one thing they
  // need to remember on the day.
  const group = application.age_category
  const reportingTime = formatReportingTime(group?.reporting_time)

  // The trial day has passed. The application keeps its own status (the club
  // may still be deciding), so this sits beside it rather than replacing it.
  const trialOver = isTrialOver(r)

  // The date they picked, on a city-tour trial. It is THEIR date, so it wins
  // over the recruitment's own — the whole point of a choose_one trial is
  // that the two differ.
  const session = application.session
  const trialDateIso = session?.date ?? r.event_date
  const trialDate = session
    ? formatSessionDate(session.date, timeZone)
    : r.event_date
      ? formatSessionDate(r.event_date, timeZone)
      : null
  const trialTime = session ? formatSessionTimeRange(session) : null
  const dateLine = [trialDate, trialTime].filter(Boolean).join(" · ") || null

  // sessionPlace answers "where, but only when it is somewhere else", so this
  // falls back to the trial's own city rather than showing nothing.
  const venue = (session ? sessionPlace(session, r) : null) ?? r.city?.trim() ?? ""

  /**
   * The right-hand side of the strip. A confirmed trial still ahead gets the
   * countdown, because that is the only thing on this card the player is
   * going to act on; everything else says when they applied, which is the
   * question they actually ask about a quiet application.
   */
  const upcoming =
    application.status === "trial_confirmed" && !trialOver
      ? countdownLabel(daysUntil(trialDateIso, timeZone))
      : null
  const contextLine =
    upcoming ?? `Applied ${dayjs(application.applied_at).format("D MMM")}`

  /**
   * THE ONE THING THEY CAN ACT ON BEFORE TURNING UP. Only where there is a
   * fee AND the org has not recorded it: a paid one needs no line, and a free
   * trial must never read as a debt.
   */
  const feeUnpaid = !!r.is_paid && !application.fee_paid

  // The pass exists once the org has CALLED them to the trial — that is the
  // status the whole thing is issued against.
  const hasPass = application.status === "trial_confirmed"

  // Context for the feedback prompt: the city and the date they went on, so
  // "How did the trial go?" names WHICH trial without a second line of prose.
  const feedbackSubtitle = [
    r.city,
    session ? formatSessionDate(session.date, timeZone) : null,
  ]
    .filter(Boolean)
    .join(" · ") || null

  const isLookingForPlayers = r.recruitment_type === "player_looking"

  return (
    <article className={`${styles.card} ${styles[TONE_CLASS[tone]]}`}>
      {/* ── The status strip ── First, full width, and tinted: the status is
          the only reason this tab gets opened. ── */}
      <div className={styles.strip}>
        <span className={styles.stripStatus}>
          <Icon icon={meta.icon} width={15} height={15} />
          <span className={styles.stripLabel}>{meta.label}</span>
          {/* A fact about the calendar, not about the application — the club
              may still be deciding, so this sits beside the status rather
              than replacing it. */}
          {trialOver && <span className={styles.endedBadge}>Trial ended</span>}
        </span>
        <span className={styles.stripContext}>{contextLine}</span>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* FIXED in both dimensions, and never stretched to the column beside
            it. The my-applications payload carries no cover media, so this is
            always one of the two designed fallbacks rather than a photo. */}
        <div className={styles.thumb} aria-hidden="true">
          <Icon
            icon={
              isLookingForPlayers
                ? "mdi:account-search-outline"
                : r.sport.icon_name || "mdi:trophy-outline"
            }
            className={styles.thumbGlyph}
          />
        </div>

        <div className={styles.bodyText}>
          <Link href={toRecruitment(r.id)} className={styles.titleLink}>
            <h3 className={styles.title}>{r.title}</h3>
          </Link>

          <Link
            href={toProfile(r.organization.username, "organization")}
            className={styles.orgLink}
          >
            <Avatar
              src={r.organization.logo}
              initials={r.organization.name?.slice(0, 2).toUpperCase()}
              size="xs"
              className={styles.orgAvatar}
            />
            <span className={styles.orgName}>{r.organization.name}</span>
            {r.organization.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={12}
                height={12}
                className={styles.verified}
              />
            )}
          </Link>

          {(dateLine || venue) && (
            <div className={styles.facts}>
              {dateLine && (
                <span className={styles.fact}>
                  <Icon icon="mdi:calendar-blank-outline" width={13} height={13} />
                  <span className={styles.factText}>{dateLine}</span>
                </span>
              )}
              {venue && (
                <span className={styles.fact}>
                  <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                  <span className={styles.factText}>{venue}</span>
                </span>
              )}
            </div>
          )}

          {group && (
            <p className={styles.groupLine}>
              Under <strong>{group.title}</strong>
              {reportingTime ? ` · report by ${reportingTime}` : ""}
            </p>
          )}

          {/* A line, not a box. The old full-width "Fee: Not marked" panel
              took a whole row to say what fits on one. */}
          {feeUnpaid && (
            <p className={styles.feeLine}>
              <Icon icon="mdi:cash-clock" width={13} height={13} />
              Fee not marked paid
            </p>
          )}
        </div>
      </div>

      {/* Updates addressed to THIS player. The server decides which ones
          reach them — an "all applicants" notice is public to anyone who can
          see the posting, a targeted one only to its own audience. */}
      <AnnouncementList recruitmentId={r.id} timeZone={timeZone} />

      {/* HOW DID IT GO? Inline, at the foot of the card, because this tab is
          where a player actually meets the question. Renders itself only when
          the server says to ask — or a quiet summary once they have answered,
          and nothing when neither. Never a banner, never a modal that opens
          by itself. */}
      <TrialFeedbackPrompt
        applicationId={application.id}
        application={application}
        recruitmentId={r.id}
        orgName={r.organization.name}
        subtitle={feedbackSubtitle}
        className={styles.feedback}
      />

      {hasActions(application.status) && (
        <div className={styles.actionRow}>
          {hasPass && (
            <Link
              href={`/applications/${application.id}/pass`}
              className={styles.primaryBtn}
            >
              <Icon icon="mdi:card-account-details-outline" width={15} height={15} />
              My trial pass
            </Link>
          )}
          <Link href={toRecruitment(r.id)} className={styles.secondaryBtn}>
            View
            <Icon icon="mdi:arrow-right" width={14} height={14} />
          </Link>
        </div>
      )}
    </article>
  )
}
