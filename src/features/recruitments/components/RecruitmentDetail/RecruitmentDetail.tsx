"use client"

/**
 * RecruitmentDetail
 *
 * Renders the full detail view of a recruitment.
 * Automatically detects viewer context:
 *   - isOrgView=true  → org-admin perspective (stats panel, edit/status buttons)
 *   - isOrgView=false → applicant perspective (my_application status, apply CTA)
 */

import { useState, useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useRecruitmentDetail } from "../../hooks/useRecruitments"
import type {
  RecruitmentDetail as TRecruitmentDetail,
  RecruitmentMedia,
  ApplicationStatus,
} from "../../services/recruitments.api"
import styles from "./RecruitmentDetail.module.css"

dayjs.extend(relativeTime)

// ── Helpers ───────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: string; colorClass: string }> = {
  open_trial:         { label: "Open Trial",          icon: "mdi:whistle-outline",           colorClass: "typeTrial"       },
  player_looking:     { label: "Player Looking",       icon: "mdi:account-search-outline",    colorClass: "typePlayer"      },
  direct_recruitment: { label: "Direct Recruitment",   icon: "mdi:account-arrow-right-outline", colorClass: "typeDirect"    },
  scholarship:        { label: "Scholarship",           icon: "mdi:school-outline",            colorClass: "typeScholarship" },
}

const STATUS_META: Record<string, { label: string; colorClass: string; icon: string }> = {
  active:    { label: "Active",    colorClass: "statusActive",    icon: "mdi:check-circle-outline"  },
  draft:     { label: "Draft",     colorClass: "statusDraft",     icon: "mdi:pencil-outline"         },
  closed:    { label: "Closed",    colorClass: "statusClosed",    icon: "mdi:close-circle-outline"   },
  cancelled: { label: "Cancelled", colorClass: "statusCancelled", icon: "mdi:cancel"                 },
}

const APP_STATUS_META: Record<ApplicationStatus, { label: string; icon: string; colorClass: string }> = {
  applied:     { label: "Application Submitted", icon: "mdi:check-circle-outline",    colorClass: "appApplied"     },
  reviewing:   { label: "Under Review",          icon: "mdi:eye-outline",              colorClass: "appReviewing"   },
  shortlisted: { label: "Shortlisted",           icon: "mdi:star-outline",             colorClass: "appShortlisted" },
  invited:     { label: "Invited",               icon: "mdi:email-check-outline",      colorClass: "appInvited"     },
  selected:    { label: "Selected",              icon: "mdi:trophy-outline",           colorClass: "appSelected"    },
  rejected:    { label: "Not Shortlisted",       icon: "mdi:close-circle-outline",     colorClass: "appRejected"    },
  withdrawn:   { label: "Withdrawn",             icon: "mdi:undo-variant",             colorClass: "appWithdrawn"   },
}

const GENDER_LABEL: Record<string, string> = {
  male: "Male", female: "Female", all: "Open to All",
}

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public", followers_only: "Followers Only", private: "Private",
}

function fmtDate(iso: string | null | undefined, fallback = "—") {
  if (!iso) return fallback
  return dayjs(iso).format("DD MMM YYYY, h:mm A")
}

function fmtDateShort(iso: string | null | undefined, fallback = "—") {
  if (!iso) return fallback
  return dayjs(iso).format("DD MMM YYYY")
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function isDeadlinePast(iso: string | null | undefined): boolean {
  if (!iso) return false
  return dayjs(iso).isBefore(dayjs())
}

// ── Media carousel (reused inline) ────────────────────────────

function DetailMediaCarousel({ media }: { media: RecruitmentMedia[] }) {
  const sorted = [...media].sort((a, b) => a.order - b.order)
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const touchStartX = useRef(0)

  const total = sorted.length
  const current = sorted[idx]

  const goTo = useCallback((i: number) => {
    setLoaded(false)
    setIdx(Math.max(0, Math.min(i, total - 1)))
  }, [total])

  if (total === 0) return null

  return (
    <div className={styles.mediaCarousel}>
      <div
        className={styles.mediaSlide}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          const diff = touchStartX.current - e.changedTouches[0].clientX
          if (Math.abs(diff) > 40) goTo(idx + (diff > 0 ? 1 : -1))
        }}
      >
        {!loaded && <div className={styles.mediaSkeleton} />}
        {current.media_type === "video" ? (
          <video
            key={current.id}
            src={current.file_url}
            className={`${styles.mediaAsset} ${loaded ? styles.mediaLoaded : ""}`}
            controls
            playsInline
            muted
            poster={current.thumbnail_url || undefined}
            onCanPlay={() => setLoaded(true)}
          />
        ) : (
          <img
            key={current.id}
            src={current.file_url}
            alt={`Media ${idx + 1}`}
            className={`${styles.mediaAsset} ${loaded ? styles.mediaLoaded : ""}`}
            onLoad={() => setLoaded(true)}
            loading="lazy"
          />
        )}

        {/* Counter */}
        {total > 1 && (
          <span className={styles.mediaCounter}>{idx + 1}/{total}</span>
        )}

        {/* Nav arrows */}
        {total > 1 && idx > 0 && (
          <button
            className={`${styles.mediaNav} ${styles.mediaNavPrev}`}
            onClick={() => goTo(idx - 1)}
            type="button"
            aria-label="Previous"
          >
            <Icon icon="mdi:chevron-left" width={22} height={22} />
          </button>
        )}
        {total > 1 && idx < total - 1 && (
          <button
            className={`${styles.mediaNav} ${styles.mediaNavNext}`}
            onClick={() => goTo(idx + 1)}
            type="button"
            aria-label="Next"
          >
            <Icon icon="mdi:chevron-right" width={22} height={22} />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {total > 1 && (
        <div className={styles.mediaDots}>
          {sorted.map((_, i) => (
            <button
              key={i}
              className={`${styles.mediaDot} ${i === idx ? styles.mediaDotActive : ""}`}
              onClick={() => goTo(i)}
              type="button"
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Info row ──────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoIcon}>
        <Icon icon={icon} width={15} height={15} />
      </span>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────

function StatCard({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statIcon}>
        <Icon icon={icon} width={18} height={18} />
      </span>
      <span className={styles.statValue}>{typeof value === "number" ? fmtCount(value) : value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

// ── Application status banner ─────────────────────────────────

function ApplicationBanner({ status }: { status: ApplicationStatus }) {
  const meta = APP_STATUS_META[status]
  return (
    <div className={`${styles.appBanner} ${styles[meta.colorClass]}`}>
      <span className={styles.appBannerIcon}>
        <Icon icon={meta.icon} width={20} height={20} />
      </span>
      <div className={styles.appBannerText}>
        <span className={styles.appBannerLabel}>Your Application</span>
        <span className={styles.appBannerStatus}>{meta.label}</span>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={`${styles.skShimmer} ${styles.skHero}`} />
      <div className={styles.skBody}>
        <div className={`${styles.skShimmer} ${styles.skTitle}`} />
        <div className={`${styles.skShimmer} ${styles.skLine}`} />
        <div className={`${styles.skShimmer} ${styles.skLine} ${styles.skLineShort}`} />
        <div className={styles.skGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${styles.skShimmer} ${styles.skCard}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

interface RecruitmentDetailProps {
  recruitmentId: string
  /** True when rendered inside org admin panel */
  isOrgView?: boolean
  onEdit?: () => void
  onStatusChange?: (status: string) => void
}

export default function RecruitmentDetail({
  recruitmentId,
  isOrgView = false,
  onEdit,
  onStatusChange,
}: RecruitmentDetailProps) {
  const { data, isLoading, isError } = useRecruitmentDetail(recruitmentId)

  if (isLoading) return <DetailSkeleton />

  if (isError || !data) {
    return (
      <div className={styles.errorState}>
        <Icon icon="mdi:alert-circle-outline" width={40} height={40} />
        <p>Failed to load recruitment details.</p>
      </div>
    )
  }

  const r = data
  const typeMeta   = TYPE_META[r.recruitment_type]   ?? TYPE_META.open_trial
  const statusMeta = r.status ? (STATUS_META[r.status] ?? STATUS_META.draft) : null

  const primaryPositions   = r.positions.filter((p) => p.is_primary)
  const secondaryPositions = r.positions.filter((p) => !p.is_primary)

  const deadlinePast = isDeadlinePast(r.application_deadline)

  return (
    <div className={styles.wrapper}>

      {/* ── Media ── */}
      {r.media.length > 0 && <DetailMediaCarousel media={r.media} />}

      {/* ── Header card ── */}
      <div className={styles.headerCard}>

        {/* Org row */}
        <Link
          href={`/organization/${r.organization.username}`}
          className={styles.orgRow}
        >
          <Avatar
            src={r.organization.logo}
            initials={r.organization.name?.slice(0, 2).toUpperCase()}
            size="md"
          />
          <div className={styles.orgInfo}>
            <span className={styles.orgName}>
              {r.organization.name}
              {r.organization.is_verified && (
                <Icon icon="mdi:check-decagram" width={14} height={14} className={styles.verified} />
              )}
            </span>
            {r.organization.headline && (
              <span className={styles.orgHeadline}>{r.organization.headline}</span>
            )}
          </div>
          <Icon icon="mdi:chevron-right" width={18} height={18} className={styles.orgChevron} />
        </Link>

        {/* Title + badges */}
        <div className={styles.titleSection}>
          <div className={styles.titleBadgeRow}>
            <span className={`${styles.typePill} ${styles[typeMeta.colorClass]}`}>
              <Icon icon={typeMeta.icon} width={12} height={12} />
              {typeMeta.label}
            </span>

            {/* Status — only in org view */}
            {isOrgView && statusMeta && (
              <span className={`${styles.statusPill} ${styles[statusMeta.colorClass]}`}>
                <Icon icon={statusMeta.icon} width={12} height={12} />
                {statusMeta.label}
              </span>
            )}

            {/* Sport */}
            <span className={styles.sportPill}>
              <Icon icon={r.sport.icon_name || "mdi:trophy-outline"} width={12} height={12} />
              {r.sport.name}
            </span>
          </div>

          <h1 className={styles.title}>{r.title}</h1>
          {r.short_description && (
            <p className={styles.shortDesc}>{r.short_description}</p>
          )}
        </div>

        {/* Org-view action row */}
        {isOrgView && (
          <div className={styles.orgActions}>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={onEdit}
            >
              <Icon icon="mdi:pencil-outline" width={15} height={15} />
              Edit
            </button>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={() => onStatusChange?.(r.status ?? "draft")}
            >
              <Icon icon="mdi:swap-horizontal" width={15} height={15} />
              Change Status
            </button>
            <Link
              href={`/organization/admin/${r.organization.id}/recruitments/${r.id}/applications`}
              className={styles.btnPrimary}
            >
              <Icon icon="mdi:account-multiple-outline" width={15} height={15} />
              View Applications
            </Link>
          </div>
        )}

        {/* User-view: my application status */}
        {!isOrgView && r.my_application && (
          <ApplicationBanner status={r.my_application.status} />
        )}

        {/* User-view: apply CTA */}
        {!isOrgView && !r.my_application && (
          <div className={styles.applyCta}>
            {r.can_apply ? (
              <button className={styles.btnApply} type="button">
                <Icon icon="mdi:send-outline" width={16} height={16} />
                Apply Now
              </button>
            ) : deadlinePast ? (
              <div className={styles.applyClosedMsg}>
                <Icon icon="mdi:clock-alert-outline" width={16} height={16} />
                Application deadline has passed
              </div>
            ) : (
              <div className={styles.applyClosedMsg}>
                <Icon icon="mdi:lock-outline" width={16} height={16} />
                Applications are not open
              </div>
            )}
            {r.application_deadline && (
              <span className={`${styles.deadlineNote} ${deadlinePast ? styles.deadlinePast : ""}`}>
                <Icon icon="mdi:calendar-clock" width={13} height={13} />
                Deadline: {fmtDateShort(r.application_deadline)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Org-view stats panel ── */}
      {isOrgView && (
        <div className={styles.statsPanel}>
          <StatCard icon="mdi:account-multiple-outline"  value={r.applications_count}     label="Applied"     />
          <StatCard icon="mdi:star-outline"               value={r.shortlisted_count ?? 0} label="Shortlisted" />
          <StatCard icon="mdi:trophy-outline"             value={r.selected_count ?? 0}    label="Selected"    />
          <StatCard icon="mdi:eye-outline"                value={r.views_count ?? 0}       label="Views"       />
        </div>
      )}

      {/* ── Description ── */}
      {r.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About This Recruitment</h2>
          <p className={styles.descText}>{r.description}</p>
        </section>
      )}

      {/* ── Positions ── */}
      {r.positions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:account-star-outline" width={16} height={16} />
            Positions
          </h2>
          <div className={styles.positionsList}>
            {primaryPositions.map((p) => (
              <span key={p.position.id} className={`${styles.posTag} ${styles.posTagPrimary}`}>
                {p.position.name}
                <span className={styles.posTagBadge}>Primary</span>
              </span>
            ))}
            {secondaryPositions.map((p) => (
              <span key={p.position.id} className={styles.posTag}>
                {p.position.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Details grid ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon icon="mdi:information-outline" width={16} height={16} />
          Details
        </h2>
        <div className={styles.infoGrid}>
          {r.event_date && (
            <InfoRow
              icon="mdi:calendar"
              label="Trial Date"
              value={fmtDate(r.event_date)}
            />
          )}
          {r.application_deadline && (
            <InfoRow
              icon="mdi:calendar-clock"
              label="Apply Before"
              value={
                <span className={deadlinePast ? styles.textError : undefined}>
                  {fmtDate(r.application_deadline)}
                  {deadlinePast && " (Closed)"}
                </span>
              }
            />
          )}
          {(r.min_age || r.max_age) && (
            <InfoRow
              icon="mdi:account-clock-outline"
              label="Age Group"
              value={
                r.min_age && r.max_age
                  ? `${r.min_age} – ${r.max_age} years`
                  : r.min_age
                  ? `${r.min_age}+ years`
                  : `Under ${r.max_age} years`
              }
            />
          )}
          {r.gender && (
            <InfoRow
              icon="mdi:gender-male-female"
              label="Gender"
              value={GENDER_LABEL[r.gender] ?? r.gender}
            />
          )}
          {r.experience_level && (
            <InfoRow
              icon="mdi:medal-outline"
              label="Experience"
              value={r.experience_level}
            />
          )}
          {(r.city || r.location_name) && (
            <InfoRow
              icon="mdi:map-marker-outline"
              label="Location"
              value={[r.location_name, r.city, r.country_code].filter(Boolean).join(", ")}
            />
          )}
          {r.is_remote && (
            <InfoRow
              icon="mdi:laptop"
              label="Format"
              value="Remote / Online"
            />
          )}
          <InfoRow
            icon="mdi:eye-outline"
            label="Visibility"
            value={VISIBILITY_LABEL[r.visibility] ?? r.visibility}
          />
        </div>
      </section>

      {/* ── Fee info ── */}
      {r.is_paid && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:currency-inr" width={16} height={16} />
            Fee
          </h2>
          <div className={styles.feeCard}>
            <span className={styles.feeAmount}>
              {r.fee_currency} {parseFloat(r.fee_amount ?? "0").toLocaleString()}
            </span>
            {r.payment_note && (
              <p className={styles.feeNote}>{r.payment_note}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Questions (visible to user only before apply / to org always) ── */}
      {r.questions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:comment-question-outline" width={16} height={16} />
            Application Questions
            <span className={styles.sectionCount}>{r.questions.length}</span>
          </h2>
          <div className={styles.questionsList}>
            {r.questions.map((q, i) => (
              <div key={q.id} className={styles.questionItem}>
                <div className={styles.questionHeader}>
                  <span className={styles.questionNum}>{i + 1}</span>
                  <span className={styles.questionText}>
                    {q.question}
                    {q.is_required && <span className={styles.required}>*</span>}
                  </span>
                  <span className={styles.fieldTypeBadge}>{q.field_type.replace("_", " ")}</span>
                </div>
                {q.options.length > 0 && (
                  <div className={styles.questionOptions}>
                    {q.options.map((opt) => (
                      <span key={opt.id} className={styles.optionChip}>{opt.value}</span>
                    ))}
                  </div>
                )}
                {q.help_text && (
                  <p className={styles.questionHelp}>{q.help_text}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Org-view meta ── */}
      {isOrgView && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:clock-outline" width={16} height={16} />
            Timestamps
          </h2>
          <div className={styles.infoGrid}>
            <InfoRow icon="mdi:plus-circle-outline"   label="Created"   value={fmtDate(r.created_at)} />
            {r.published_at && (
              <InfoRow icon="mdi:publish"             label="Published" value={fmtDate(r.published_at)} />
            )}
            {r.updated_at && (
              <InfoRow icon="mdi:pencil-circle-outline" label="Updated"  value={fmtDate(r.updated_at)} />
            )}
          </div>
        </section>
      )}

      {/* ── Bottom apply CTA (user, sticky feel) ── */}
      {!isOrgView && !r.my_application && r.can_apply && (
        <div className={styles.bottomCta}>
          <button className={styles.btnApply} type="button">
            <Icon icon="mdi:send-outline" width={16} height={16} />
            Apply Now
          </button>
        </div>
      )}

    </div>
  )
}