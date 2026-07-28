"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import styles from "./RecruitmentCard.module.css"
import { Recruitment } from "../../services/recruitments.api"


dayjs.extend(relativeTime)

// ── Helpers ───────────────────────────────────────────────────

const TYPE_META: Record<
  string,
  { label: string; icon: string; colorClass: string }
> = {
  open_trial: {
    label: "Open Trial",
    icon: "mdi:whistle-outline",
    colorClass: "typeTrial",
  },
  private_trial: {
    label: "Private Trial",
    icon: "mdi:lock-outline",
    colorClass: "typePrivate",
  },
  direct_recruitment: {
    label: "Direct Recruitment",
    icon: "mdi:account-arrow-right-outline",
    colorClass: "typeDirect",
  },
  scholarship: {
    label: "Scholarship",
    icon: "mdi:school-outline",
    colorClass: "typeScholarship",
  },
}

const STATUS_META: Record<string, { label: string; colorClass: string }> = {
  active: { label: "Active", colorClass: "statusActive" },
  draft: { label: "Draft", colorClass: "statusDraft" },
  closed: { label: "Closed", colorClass: "statusClosed" },
  cancelled: { label: "Cancelled", colorClass: "statusCancelled" },
}

function fmtDate(iso: string) {
  return dayjs(iso).format("DD MMM YYYY")
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// ── Props ─────────────────────────────────────────────────────

interface RecruitmentCardProps {
  recruitment: Recruitment
  /** Show org branding — false when card is inside org's own profile */
  showOrg?: boolean
}

// ── Component ─────────────────────────────────────────────────

export default function RecruitmentCard({
  recruitment,
  showOrg = true,
}: RecruitmentCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const [shareOpen, setShareOpen] = useState(false)

  const typeMeta =
    TYPE_META[recruitment.recruitment_type] ?? TYPE_META.open_trial
  const statusMeta = STATUS_META[recruitment.status] ?? STATUS_META.active

  const allPositions = recruitment.positions.map((p) => p.position.name)

  const timeAgo = dayjs(recruitment.created_at).fromNow()

  return (
    <article className={styles.card}>
      {/* ── Top row: org + status ── */}
      {showOrg && (
        <div className={styles.orgRow}>
          <Link
            href={toProfile(recruitment.organization.username, "organization")}
            className={styles.orgLink}
          >
            <Avatar
              src={recruitment.organization.logo}
              initials={recruitment.organization.name?.slice(0, 2).toUpperCase()}
              size="sm"
            />
            <div className={styles.orgMeta}>
              <span className={styles.orgName}>
                {recruitment.organization.name}
                {recruitment.organization.is_verified && (
                  <Icon
                    icon="mdi:check-decagram"
                    width={13}
                    height={13}
                    className={styles.verifiedBadge}
                  />
                )}
              </span>
              {recruitment.organization.headline && (
                <span className={styles.orgHeadline}>
                  {recruitment.organization.headline}
                </span>
              )}
            </div>
          </Link>

          <span className={`${styles.statusBadge} ${styles[statusMeta.colorClass]}`}>
            {statusMeta.label}
          </span>
        </div>
      )}

      {/* ── Title + sport icon ── */}
      <div className={styles.titleRow}>
        <div className={styles.sportIcon} aria-label={recruitment.sport.name}>
          <Icon
            icon={recruitment.sport.icon_name || "mdi:trophy-outline"}
            width={20}
            height={20}
          />
        </div>
        <div className={styles.titleBlock}>
          <Link
            href={toRecruitment(recruitment.id)}
            className={styles.titleLink}
          >
            <h3 className={styles.title}>{recruitment.title}</h3>
          </Link>
          {/* Short description is optional — skip the block entirely when
              it's blank so the card doesn't keep an empty line's gap. */}
          {recruitment.short_description && (
            <p className={styles.description}>{recruitment.short_description}</p>
          )}
        </div>
      </div>

      {/* ── Positions ── */}
      {allPositions.length > 0 && (
        <div className={styles.positions}>
          {allPositions.map((pos) => (
            <span key={pos} className={styles.posTag}>
              {pos}
            </span>
          ))}
        </div>
      )}

      {/* ── Meta row ── */}
      <div className={styles.metaRow}>
        {/* Type pill */}
        <span className={`${styles.typePill} ${styles[typeMeta.colorClass]}`}>
          <Icon icon={typeMeta.icon} width={12} height={12} />
          {typeMeta.label}
        </span>

        <span className={styles.metaDivider} />

        {/* City */}
        {recruitment.city && (
          <>
            <span className={styles.metaItem}>
              <Icon icon="mdi:map-marker-outline" width={13} height={13} />
              {recruitment.city}
            </span>
            <span className={styles.metaDivider} />
          </>
        )}

        {/* Event date */}
        <span className={styles.metaItem}>
          <Icon icon="mdi:calendar-outline" width={13} height={13} />
          {fmtDate(recruitment.event_date)}
        </span>
      </div>

      {/* ── Footer ── */}
      <div className={styles.footer}>
        <span className={styles.timeAgo}>{timeAgo}</span>

        <div className={styles.footerRight}>
          {recruitment.applications_count > 0 && (
            <span className={styles.applicants}>
              <Icon icon="mdi:account-multiple-outline" width={13} height={13} />
              {fmtCount(recruitment.applications_count)} applied
            </span>
          )}

          <button
            type="button"
            className={styles.shareBtn}
            onClick={() => setShareOpen(true)}
            aria-label="Share recruitment"
            title="Share"
          >
            <Icon icon="mdi:share-variant-outline" width={16} height={16} />
          </button>

          <Link
            href={toRecruitment(recruitment.id)}
            className={styles.applyBtn}
          >
            View
            <Icon icon="mdi:arrow-right" width={14} height={14} />
          </Link>
        </div>
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{ type: "recruitment", id: recruitment.id }}
        previewNode={
          <RecruitmentSharePreview
            title={recruitment.title}
            orgName={recruitment.organization.name}
            sportName={recruitment.sport.name}
            sportIcon={recruitment.sport.icon_name}
          />
        }
      />
    </article>
  )
}