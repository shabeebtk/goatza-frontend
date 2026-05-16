"use client"

/**
 * RecruitmentDetail — Production-ready
 *
 * Changes from previous version:
 * - Age categories shown as visual cards with birth year ranges + reporting time
 * - Apply method routing: goatza → in-app, external → redirect, contact → show contacts
 * - Empty positions → "All positions welcome" fallback
 * - Benefits + Requirements rendered as visual grids
 * - Contacts rendered as tappable links (tel / mailto)
 * - Venue shown with map link
 * - Age category section replaces generic age range
 * - Org-view: stats panel, timestamps, full status + meta
 * - All API fields from both response shapes handled
 */

import { useState, useCallback, useRef } from "react"
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

// ── Helpers ────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: string; colorClass: string }> = {
  open_trial:         { label: "Open Trial",          icon: "mdi:whistle-outline",             colorClass: "typeTrial"       },
  player_looking:     { label: "Player Looking",       icon: "mdi:account-search-outline",      colorClass: "typePlayer"      },
  direct_recruitment: { label: "Direct Recruitment",   icon: "mdi:account-arrow-right-outline", colorClass: "typeDirect"      },
  scholarship:        { label: "Scholarship",           icon: "mdi:school-outline",              colorClass: "typeScholarship" },
}

const STATUS_META: Record<string, { label: string; colorClass: string; icon: string }> = {
  active:    { label: "Active",    colorClass: "statusActive",    icon: "mdi:check-circle-outline" },
  draft:     { label: "Draft",     colorClass: "statusDraft",     icon: "mdi:pencil-outline"        },
  closed:    { label: "Closed",    colorClass: "statusClosed",    icon: "mdi:close-circle-outline"  },
  cancelled: { label: "Cancelled", colorClass: "statusCancelled", icon: "mdi:cancel"                },
}

const APP_STATUS_META: Record<ApplicationStatus, { label: string; icon: string; colorClass: string }> = {
  applied:     { label: "Application Submitted", icon: "mdi:check-circle-outline",  colorClass: "appApplied"     },
  reviewing:   { label: "Under Review",          icon: "mdi:eye-outline",            colorClass: "appReviewing"   },
  shortlisted: { label: "Shortlisted ⚡",         icon: "mdi:star-outline",           colorClass: "appShortlisted" },
  invited:     { label: "Invited to Trial",       icon: "mdi:email-check-outline",   colorClass: "appInvited"     },
  selected:    { label: "Selected 🏆",            icon: "mdi:trophy-outline",         colorClass: "appSelected"    },
  rejected:    { label: "Not Shortlisted",        icon: "mdi:close-circle-outline",  colorClass: "appRejected"    },
  withdrawn:   { label: "Withdrawn",              icon: "mdi:undo-variant",           colorClass: "appWithdrawn"   },
}

const BENEFIT_ICONS: Record<string, string> = {
  coach:      "mdi:whistle-outline",
  trophy:     "mdi:trophy-outline",
  award:      "mdi:medal-outline",
  scholarship:"mdi:school-outline",
  fitness:    "mdi:run-fast",
  travel:     "mdi:airplane-outline",
  kit:        "mdi:tshirt-crew-outline",
  certificate:"mdi:certificate-outline",
}

const GENDER_LABEL: Record<string, string> = {
  male: "Male Only", female: "Female Only", all: "Open to All",
}

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public", followers_only: "Followers Only", private: "Private",
}

const EXPERIENCE_LABEL: Record<string, string> = {
  district:  "District Level",
  state:     "State Level",
  national:  "National Level",
  beginner:  "Beginner",
  inter:     "Intermediate",
  advanced:  "Advanced",
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

function fmtReportingTime(t: string | null | undefined): string {
  if (!t) return ""
  // "07:00:00" → "7:00 AM"
  const [h, m] = t.split(":")
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${m} ${ampm}`
}

function birthYearToAge(year: number): number {
  return new Date().getFullYear() - year
}

// ── Media carousel ─────────────────────────────────────────────

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
        {total > 1 && <span className={styles.mediaCounter}>{idx + 1}/{total}</span>}
        {total > 1 && idx > 0 && (
          <button className={`${styles.mediaNav} ${styles.mediaNavPrev}`} onClick={() => goTo(idx - 1)} type="button" aria-label="Previous">
            <Icon icon="mdi:chevron-left" width={22} height={22} />
          </button>
        )}
        {total > 1 && idx < total - 1 && (
          <button className={`${styles.mediaNav} ${styles.mediaNavNext}`} onClick={() => goTo(idx + 1)} type="button" aria-label="Next">
            <Icon icon="mdi:chevron-right" width={22} height={22} />
          </button>
        )}
      </div>
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

// ── Info row ───────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoIcon}><Icon icon={icon} width={15} height={15} /></span>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────

function StatCard({ icon, value, label, accent }: { icon: string; value: string | number; label: string; accent?: boolean }) {
  return (
    <div className={`${styles.statCard} ${accent ? styles.statCardAccent : ""}`}>
      <span className={styles.statIcon}><Icon icon={icon} width={18} height={18} /></span>
      <span className={styles.statValue}>{typeof value === "number" ? fmtCount(value) : value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

// ── Application banner ─────────────────────────────────────────

function ApplicationBanner({ status, appliedAt }: { status: ApplicationStatus; appliedAt?: string }) {
  const meta = APP_STATUS_META[status] ?? APP_STATUS_META.applied
  return (
    <div className={`${styles.appBanner} ${styles[meta.colorClass]}`}>
      <span className={styles.appBannerIcon}><Icon icon={meta.icon} width={22} height={22} /></span>
      <div className={styles.appBannerText}>
        <span className={styles.appBannerLabel}>Your Application</span>
        <span className={styles.appBannerStatus}>{meta.label}</span>
        {appliedAt && (
          <span className={styles.appBannerDate}>Applied {dayjs(appliedAt).fromNow()}</span>
        )}
      </div>
    </div>
  )
}

// ── Age category card ──────────────────────────────────────────

function AgeCategoryCard({ category }: { category: { id: string; title: string; min_birth_year: number; max_birth_year: number; reporting_time?: string | null } }) {
  const minAge = birthYearToAge(category.max_birth_year) // older birth year = younger age
  const maxAge = birthYearToAge(category.min_birth_year)
  return (
    <div className={styles.ageCatCard}>
      <div className={styles.ageCatBadge}>{category.title}</div>
      <div className={styles.ageCatAges}>{minAge}–{maxAge} yrs</div>
      <div className={styles.ageCatYears}>Born {category.max_birth_year}–{category.min_birth_year}</div>
      {category.reporting_time && (
        <div className={styles.ageCatTime}>
          <Icon icon="mdi:clock-outline" width={12} height={12} />
          Report by {fmtReportingTime(category.reporting_time)}
        </div>
      )}
    </div>
  )
}

// ── Apply CTA block ────────────────────────────────────────────

function ApplyCTA({
  r,
  deadlinePast,
  compact = false,
}: {
  r: TRecruitmentDetail
  deadlinePast: boolean
  compact?: boolean
}) {
  const method = r.apply_method

  // External apply
  if (method === "external") {
    const url = r.external_apply_url
    if (url) {
      return (
        <div className={`${styles.applyCta} ${compact ? styles.applyCtaCompact : ""}`}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnApply}
          >
            <Icon icon="mdi:open-in-new" width={16} height={16} />
            Apply on External Site
          </a>
          {r.application_deadline && (
            <span className={`${styles.deadlineNote} ${deadlinePast ? styles.deadlinePast : ""}`}>
              <Icon icon="mdi:calendar-clock" width={13} height={13} />
              Deadline: {fmtDateShort(r.application_deadline)}{deadlinePast ? " (Closed)" : ""}
            </span>
          )}
        </div>
      )
    }
    // Fallback: no external URL
    return (
      <div className={`${styles.applyCta} ${compact ? styles.applyCtaCompact : ""}`}>
        <div className={styles.applyClosedMsg}>
          <Icon icon="mdi:link-off" width={16} height={16} />
          External application link unavailable
        </div>
      </div>
    )
  }

  // Contact-based apply
  if (method === "contact") {
    const contacts = r.contacts ?? []
    if (contacts.length > 0) {
      return (
        <div className={`${styles.applyContactCta} ${compact ? styles.applyCtaCompact : ""}`}>
          <span className={styles.applyContactLabel}>
            <Icon icon="mdi:phone-outline" width={14} height={14} />
            Apply via Contact
          </span>
          <div className={styles.applyContactList}>
            {contacts.map((c) => (
              <a
                key={c.id}
                href={c.contact_type === "phone" ? `tel:${c.value}` : `mailto:${c.value}`}
                className={styles.applyContactItem}
              >
                <Icon
                  icon={c.contact_type === "phone" ? "mdi:phone" : "mdi:email-outline"}
                  width={15}
                  height={15}
                />
                <span>{c.name ? `${c.name}: ` : ""}{c.value}</span>
              </a>
            ))}
          </div>
          {r.application_deadline && (
            <span className={`${styles.deadlineNote} ${deadlinePast ? styles.deadlinePast : ""}`}>
              <Icon icon="mdi:calendar-clock" width={13} height={13} />
              Deadline: {fmtDateShort(r.application_deadline)}{deadlinePast ? " (Closed)" : ""}
            </span>
          )}
        </div>
      )
    }
    return (
      <div className={`${styles.applyCta} ${compact ? styles.applyCtaCompact : ""}`}>
        <div className={styles.applyClosedMsg}>
          <Icon icon="mdi:phone-off" width={16} height={16} />
          Contact details unavailable
        </div>
      </div>
    )
  }

  // Goatza in-app apply (default)
  return (
    <div className={`${styles.applyCta} ${compact ? styles.applyCtaCompact : ""}`}>
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
          Deadline: {fmtDateShort(r.application_deadline)}{deadlinePast ? " (Closed)" : ""}
        </span>
      )}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────

interface RecruitmentDetailProps {
  recruitmentId: string
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
  const deadlinePast = isDeadlinePast(r.application_deadline)

  const primaryPositions   = r.positions?.filter((p) => p.is_primary) ?? []
  const secondaryPositions = r.positions?.filter((p) => !p.is_primary) ?? []
  const hasPositions = (r.positions?.length ?? 0) > 0

  const ageCategories   = r.age_categories  ?? []
  const contacts        = r.contacts        ?? []
  const benefits        = r.benefits        ?? []
  const requirements    = r.requirements    ?? []

  return (
    <div className={styles.wrapper}>

      {/* ── Media ── */}
      {(r.media?.length ?? 0) > 0 && <DetailMediaCarousel media={r.media} />}

      {/* ── Header card ── */}
      <div className={styles.headerCard}>

        {/* Org row */}
        <Link href={`/organization/${r.organization.username}`} className={styles.orgRow}>
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
            {isOrgView && statusMeta && (
              <span className={`${styles.statusPill} ${styles[statusMeta.colorClass]}`}>
                <Icon icon={statusMeta.icon} width={12} height={12} />
                {statusMeta.label}
              </span>
            )}
            <span className={styles.sportPill}>
              <Icon icon={r.sport.icon_name || "mdi:trophy-outline"} width={12} height={12} />
              {r.sport.name}
            </span>
            {r.gender && r.gender !== "all" && (
              <span className={styles.genderPill}>
                <Icon icon={r.gender === "male" ? "mdi:gender-male" : "mdi:gender-female"} width={12} height={12} />
                {GENDER_LABEL[r.gender]}
              </span>
            )}
          </div>

          <h1 className={styles.title}>{r.title}</h1>
          {r.short_description && (
            <p className={styles.shortDesc}>{r.short_description}</p>
          )}
        </div>

        {/* Org-view action row */}
        {isOrgView && (
          <div className={styles.orgActions}>
            <button className={styles.btnSecondary} type="button" onClick={onEdit}>
              <Icon icon="mdi:pencil-outline" width={15} height={15} />
              Edit
            </button>
            <button className={styles.btnSecondary} type="button" onClick={() => onStatusChange?.(r.status ?? "draft")}>
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

        {/* User: application status banner */}
        {!isOrgView && r.my_application && (
          <ApplicationBanner
            status={r.my_application.status}
            appliedAt={r.my_application.applied_at}
          />
        )}

        {/* User: apply CTA */}
        {!isOrgView && !r.my_application && (
          <ApplyCTA r={r} deadlinePast={deadlinePast} />
        )}
      </div>

      {/* ── Org stats panel ── */}
      {isOrgView && (
        <div className={styles.statsPanel}>
          <StatCard icon="mdi:account-multiple-outline" value={r.applications_count ?? 0} label="Applied" />
          <StatCard icon="mdi:star-outline"              value={r.shortlisted_count  ?? 0} label="Shortlisted" accent />
          <StatCard icon="mdi:trophy-outline"            value={r.selected_count     ?? 0} label="Selected" accent />
          <StatCard icon="mdi:eye-outline"               value={r.views_count        ?? 0} label="Views" />
        </div>
      )}

      {/* ── Key info strip ── */}
      <div className={styles.keyInfoStrip}>
        {r.event_date && (
          <div className={styles.keyInfoItem}>
            <Icon icon="mdi:calendar" width={18} height={18} className={styles.keyInfoIcon} />
            <div className={styles.keyInfoText}>
              <span className={styles.keyInfoLabel}>Trial Date</span>
              <span className={styles.keyInfoValue}>{fmtDate(r.event_date)}</span>
            </div>
          </div>
        )}
        {r.application_deadline && (
          <div className={styles.keyInfoItem}>
            <Icon icon="mdi:calendar-clock" width={18} height={18} className={`${styles.keyInfoIcon} ${deadlinePast ? styles.keyInfoIconError : ""}`} />
            <div className={styles.keyInfoText}>
              <span className={styles.keyInfoLabel}>Apply Before</span>
              <span className={`${styles.keyInfoValue} ${deadlinePast ? styles.textError : ""}`}>
                {fmtDate(r.application_deadline)}{deadlinePast ? " · Closed" : ""}
              </span>
            </div>
          </div>
        )}
        {(r.venue_name || r.city) && (
          <div className={styles.keyInfoItem}>
            {r.venue_link ? (
              <a href={r.venue_link} target="_blank" rel="noopener noreferrer" className={styles.keyInfoVenueLink}>
                <Icon icon="mdi:map-marker" width={18} height={18} className={styles.keyInfoIcon} />
                <div className={styles.keyInfoText}>
                  <span className={styles.keyInfoLabel}>Venue</span>
                  <span className={styles.keyInfoValue}>
                    {r.venue_name || r.city}
                    <Icon icon="mdi:open-in-new" width={11} height={11} className={styles.externalIcon} />
                  </span>
                </div>
              </a>
            ) : (
              <>
                <Icon icon="mdi:map-marker" width={18} height={18} className={styles.keyInfoIcon} />
                <div className={styles.keyInfoText}>
                  <span className={styles.keyInfoLabel}>Venue</span>
                  <span className={styles.keyInfoValue}>{r.venue_name || r.city}</span>
                </div>
              </>
            )}
          </div>
        )}
        {r.is_paid && r.fee_amount && (
          <div className={styles.keyInfoItem}>
            <Icon icon="mdi:currency-inr" width={18} height={18} className={styles.keyInfoIcon} />
            <div className={styles.keyInfoText}>
              <span className={styles.keyInfoLabel}>Entry Fee</span>
              <span className={styles.keyInfoValue}>
                {r.fee_currency} {parseFloat(r.fee_amount).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Description ── */}
      {r.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:information-outline" width={16} height={16} />
            About This Recruitment
          </h2>
          <p className={styles.descText}>{r.description}</p>
        </section>
      )}

      {/* ── Age Categories ── */}
      {ageCategories.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:account-group-outline" width={16} height={16} />
            Age Categories
            <span className={styles.sectionCount}>{ageCategories.length}</span>
          </h2>
          <div className={styles.ageCatGrid}>
            {ageCategories.map((cat) => (
              <AgeCategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        </section>
      )}

      {/* ── Positions ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon icon="mdi:account-star-outline" width={16} height={16} />
          Positions
        </h2>
        {hasPositions ? (
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
        ) : (
          <div className={styles.allPositionsNote}>
            <Icon icon="mdi:check-all" width={18} height={18} />
            All positions are welcome to apply
          </div>
        )}
      </section>

      {/* ── Benefits ── */}
      {benefits.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:gift-outline" width={16} height={16} />
            What You Get
          </h2>
          <div className={styles.benefitsGrid}>
            {benefits.map((b) => (
              <div key={b.id} className={styles.benefitCard}>
                <span className={styles.benefitIcon}>
                  <Icon icon={BENEFIT_ICONS[b.icon_name] ?? "mdi:star-outline"} width={20} height={20} />
                </span>
                <span className={styles.benefitTitle}>{b.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Requirements ── */}
      {requirements.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:clipboard-list-outline" width={16} height={16} />
            What to Bring
          </h2>
          <div className={styles.requirementsList}>
            {requirements.map((req) => (
              <div key={req.id} className={styles.requirementItem}>
                <span className={`${styles.reqIndicator} ${req.is_mandatory ? styles.reqMandatory : styles.reqOptional}`}>
                  <Icon
                    icon={req.is_mandatory ? "mdi:asterisk" : "mdi:plus-circle-outline"}
                    width={12}
                    height={12}
                  />
                </span>
                <span className={styles.reqTitle}>{req.title}</span>
                <span className={`${styles.reqBadge} ${req.is_mandatory ? styles.reqBadgeMandatory : styles.reqBadgeOptional}`}>
                  {req.is_mandatory ? "Required" : "Optional"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Questions ── */}
      {(r.questions?.length ?? 0) > 0 && (
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
                {q.help_text && <p className={styles.questionHelp}>{q.help_text}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Contacts (always shown; primary CTA if apply_method=contact) ── */}
      {contacts.length > 0 && r.apply_method !== "contact" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:contacts-outline" width={16} height={16} />
            Contacts
          </h2>
          <div className={styles.contactsList}>
            {contacts.map((c) => (
              <a
                key={c.id}
                href={c.contact_type === "phone" ? `tel:${c.value}` : `mailto:${c.value}`}
                className={styles.contactItem}
              >
                <span className={styles.contactIconWrap}>
                  <Icon
                    icon={c.contact_type === "phone" ? "mdi:phone-outline" : "mdi:email-outline"}
                    width={16}
                    height={16}
                  />
                </span>
                <div className={styles.contactInfo}>
                  {c.name && <span className={styles.contactName}>{c.name}</span>}
                  <span className={styles.contactValue}>{c.value}</span>
                </div>
                <Icon icon="mdi:chevron-right" width={16} height={16} className={styles.contactChevron} />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Details ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon icon="mdi:format-list-bulleted" width={16} height={16} />
          Details
        </h2>
        <div className={styles.infoGrid}>
          {r.experience_level && (
            <InfoRow
              icon="mdi:medal-outline"
              label="Level"
              value={EXPERIENCE_LABEL[r.experience_level] ?? r.experience_level}
            />
          )}
          {r.gender && (
            <InfoRow
              icon="mdi:gender-male-female"
              label="Gender"
              value={GENDER_LABEL[r.gender] ?? r.gender}
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
            <InfoRow icon="mdi:laptop" label="Format" value="Remote / Online" />
          )}
          <InfoRow
            icon="mdi:eye-outline"
            label="Visibility"
            value={VISIBILITY_LABEL[r.visibility] ?? r.visibility}
          />
          <InfoRow
            icon="mdi:send-outline"
            label="Apply Via"
            value={
              r.apply_method === "goatza"   ? "Goatza App"    :
              r.apply_method === "external" ? "External Link" :
              r.apply_method === "contact"  ? "Contact"       :
              r.apply_method
            }
          />
          {(r.applications_count ?? 0) > 0 && !isOrgView && (
            <InfoRow
              icon="mdi:account-multiple-outline"
              label="Applicants"
              value={`${fmtCount(r.applications_count)} registered`}
            />
          )}
        </div>
      </section>

      {/* ── Fee ── */}
      {r.is_paid && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:currency-inr" width={16} height={16} />
            Registration Fee
          </h2>
          <div className={styles.feeCard}>
            <span className={styles.feeAmount}>
              {r.fee_currency} {parseFloat(r.fee_amount ?? "0").toLocaleString()}
            </span>
            {r.payment_note && <p className={styles.feeNote}>{r.payment_note}</p>}
          </div>
        </section>
      )}

      {/* ── Org-view timestamps ── */}
      {isOrgView && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:clock-outline" width={16} height={16} />
            Timestamps
          </h2>
          <div className={styles.infoGrid}>
            <InfoRow icon="mdi:plus-circle-outline"    label="Created"   value={fmtDate(r.created_at)} />
            {r.published_at && (
              <InfoRow icon="mdi:publish"              label="Published" value={fmtDate(r.published_at)} />
            )}
            {r.updated_at && (
              <InfoRow icon="mdi:pencil-circle-outline" label="Updated"  value={fmtDate(r.updated_at)} />
            )}
          </div>
        </section>
      )}

      {/* ── Bottom sticky apply CTA (user, no application yet, can_apply or external) ── */}
      {!isOrgView && !r.my_application && (r.can_apply || r.apply_method === "external" || r.apply_method === "contact") && (
        <div className={styles.bottomCta}>
          <ApplyCTA r={r} deadlinePast={deadlinePast} compact />
        </div>
      )}

    </div>
  )
}