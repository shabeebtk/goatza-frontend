"use client"

import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import StatusBadge from "../StatusBadge/StatusBadge"
import { formatReportingTime } from "../../eligibility"
import { isTrialOver } from "../../trialEnded"
import {
  formatSessionDate,
  formatSessionTimeRange,
  sessionPlace,
} from "../../sessionDisplay"
import AnnouncementList from "../AnnouncementList/AnnouncementList"
import TrialFeedbackPrompt from "../TrialFeedback/TrialFeedbackPrompt"
import type { MyApplicationListItem } from "../../services/recruitments.api"
import { TYPE_LABEL } from "../../recruitmentCopy"
import styles from "./ApplicationCard.module.css"

function fmtDate(iso: string) {
  return dayjs(iso).format("DD MMM YYYY")
}

interface ApplicationCardProps {
  application: MyApplicationListItem
}

export default function ApplicationCard({ application }: ApplicationCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const r = application.recruitment

  // TYPE_LABEL, not the filter options: those carry only the creatable types,
  // and an application can point at a pre-migration one.
  const typeLabel = TYPE_LABEL[r.recruitment_type] ?? r.recruitment_type

  // The group they applied under, and when it reports — the one thing they
  // need to remember on the day.
  const group = application.age_category
  const reportingTime = formatReportingTime(group?.reporting_time)

  // The trial day has passed. The application keeps its own status (the club
  // may still be deciding), so this sits beside it rather than replacing it.
  const trialOver = isTrialOver(r)

  // The DATE they picked, on a city-tour trial. The one thing this row has
  // to say that the recruitment page cannot: which city they said.
  const session = application.session
  const sessionPlaceLabel = session ? sessionPlace(session, r) : null

  // The fee, read-only. Shown only when there IS one — an unpaid trial has
  // no fee line, and "Fee: Not marked" on a free trial reads as a debt.
  const showFee = !!r.is_paid
  const feeLabel = application.fee_paid ? "Paid" : "Not marked"

  // The pass exists once the org has CALLED them to the trial — that is the
  // status the whole thing is issued against.
  const hasPass = application.status === "trial_confirmed"

  // Context for the feedback prompt: the city and the date they went on, so
  // "How did the trial go?" names WHICH trial without a second line of prose.
  const feedbackSubtitle = [
    r.city,
    session ? formatSessionDate(session.date) : null,
  ]
    .filter(Boolean)
    .join(" · ") || null

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <Link
          href={toProfile(r.organization.username, "organization")}
          className={styles.orgLink}
        >
          <Avatar
            src={r.organization.logo}
            initials={r.organization.name?.slice(0, 2).toUpperCase()}
            size="sm"
          />
          <span className={styles.orgName}>
            {r.organization.name}
            {r.organization.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={13}
                height={13}
                className={styles.verified}
              />
            )}
          </span>
        </Link>

        <span className={styles.badges}>
          {trialOver && <span className={styles.endedBadge}>Trial ended</span>}
          <StatusBadge
            status={application.status}
            recruitmentType={r.recruitment_type}
            audience="player"
          />
        </span>
      </div>

      <Link href={toRecruitment(r.id)} className={styles.titleLink}>
        <h3 className={styles.title}>{r.title}</h3>
      </Link>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <Icon
            icon={r.sport.icon_name || "mdi:trophy-outline"}
            width={14}
            height={14}
          />
          {r.sport.name}
        </span>
        <span className={styles.metaItem}>{typeLabel}</span>
        {r.city && (
          <span className={styles.metaItem}>
            <Icon icon="mdi:map-marker-outline" width={14} height={14} />
            {r.city}
          </span>
        )}
      </div>

      {session && (
        <div className={styles.groupRow}>
          <Icon icon="mdi:calendar-check" width={13} height={13} />
          <span>
            Your date: <strong>{formatSessionDate(session.date)}</strong>
            {[formatSessionTimeRange(session), sessionPlaceLabel]
              .filter(Boolean)
              .map(part => ` · ${part}`)
              .join("")}
          </span>
        </div>
      )}

      {showFee && (
        <div className={styles.groupRow}>
          <Icon icon="mdi:cash-multiple" width={13} height={13} />
          {/* The org records this at the gate; nothing here is the
              player's to change. */}
          <span>Fee: <strong>{feeLabel}</strong></span>
        </div>
      )}

      {group && (
        <div className={styles.groupRow}>
          <Icon icon="mdi:account-group-outline" width={13} height={13} />
          <span>
            Applying under <strong>{group.title}</strong>
            {reportingTime ? ` · report by ${reportingTime}` : ""}
          </span>
        </div>
      )}

      {/* Updates addressed to THIS player. The server decides which ones
          reach them — an "all applicants" notice is public to anyone who can
          see the posting, a targeted one only to its own audience. */}
      <AnnouncementList recruitmentId={r.id} />

      {/* HOW DID IT GO? Renders itself only when the server says to ask — or
          a quiet summary once they have answered. Nothing when neither. */}
      <TrialFeedbackPrompt
        applicationId={application.id}
        application={application}
        recruitmentId={r.id}
        orgName={r.organization.name}
        subtitle={feedbackSubtitle}
        className={styles.feedback}
      />

      <div className={styles.footer}>
        <span className={styles.applied}>
          <Icon icon="mdi:calendar-check-outline" width={13} height={13} />
          Applied {fmtDate(application.applied_at)}
        </span>
        <span className={styles.footerActions}>
          {hasPass && (
            <Link
              href={`/applications/${application.id}/pass`}
              className={styles.passBtn}
            >
              <Icon icon="mdi:card-account-details-outline" width={14} height={14} />
              Trial pass
            </Link>
          )}
          <Link href={toRecruitment(r.id)} className={styles.viewBtn}>
            View
            <Icon icon="mdi:arrow-right" width={14} height={14} />
          </Link>
        </span>
      </div>
    </article>
  )
}
