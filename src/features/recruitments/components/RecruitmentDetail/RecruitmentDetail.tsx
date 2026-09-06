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
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useNavigation } from "@/shared/services/navigation.service"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import { posterSrc, videoSrc } from "@/shared/services/mediaDelivery"
import {
  useRecruitmentDetail,
  useToggleSaveRecruitment,
  useWithdrawApplication,
} from "../../hooks/useRecruitments"
import ApplyRecruitmentModal from "../ApplyRecruitmentModal/ApplyRecruitmentModal"
import StatusChangeMenu from "../StatusChangeMenu/StatusChangeMenu"
import ReportSheet from "@/features/moderation/components/ReportSheet/ReportSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import { STATUS_TRANSITIONS } from "../../statusTransitions"
import { formatBirthYears, formatReportingTime } from "../../eligibility"
import type {
  RecruitmentDetail as TRecruitmentDetail,
  RecruitmentMedia,
  RecruitmentAgeCategory,
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
  const d = dayjs(iso)
  // Time is only shown when one was actually set. A "no time" date is stored at
  // end-of-day (23:59); older rows used midnight (00:00). Both hide the time.
  const noTime =
    (d.hour() === 0 && d.minute() === 0) || (d.hour() === 23 && d.minute() === 59)
  return noTime ? d.format("DD MMM YYYY") : d.format("DD MMM YYYY, h:mm A")
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

// ── Media carousel ─────────────────────────────────────────────

function DetailMediaCarousel({ media }: { media: RecruitmentMedia[] }) {
  const sorted = [...media].sort((a, b) => a.order - b.order)
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const touchStartX = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Sound is GLOBAL (src/store/sound.store.ts) instead of hardcoded muted, so
  // arriving here from an unmuted feed plays with sound. This player renders
  // native `controls`, so onVolumeChange feeds the browser's own mute button
  // back into the store — otherwise it would be a second source of truth.
  const { muted, applyMuted, onVolumeChange } = useVideoSound(videoRef)
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
            ref={videoRef}
            src={videoSrc(current)}
            className={`${styles.mediaAsset} ${loaded ? styles.mediaLoaded : ""}`}
            controls
            playsInline
            // BARE `muted`, never muted={muted}: the server-rendered markup and
            // first client paint must always be muted, and useVideoSound sets
            // the property after mount.
            muted
            onVolumeChange={onVolumeChange}
            poster={posterSrc(current) || undefined}
            // Not `canplay`: it can fire before a frame is composited, which
            // fades the element in over black. This player doesn't autoplay, so
            // `playing` alone would keep it hidden until the user hits play —
            // `loadeddata` (first frame decoded, fires earlier than canplay)
            // reveals it with something real to show.
            onLoadedData={() => {
              setLoaded(true)
              // key={current.id} remounts the ELEMENT without remounting this
              // component, so the hook's mount effect does not re-run for the
              // new one — re-apply the store's state to it here.
              applyMuted(muted)
            }}
            onPlaying={() => setLoaded(true)}
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

function ApplicationBanner({
  r,
  onReapply,
}: {
  r: TRecruitmentDetail
  onReapply: () => void
}) {
  const app = r.my_application!
  const meta = APP_STATUS_META[app.status] ?? APP_STATUS_META.applied
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const { mutate: withdraw, isPending } = useWithdrawApplication()

  const isWithdrawn = app.status === "withdrawn"
  // LinkedIn-style: withdraw is allowed from ANY status except withdrawn.
  const canWithdraw = !isWithdrawn
  // Once the outcome is final, keep withdraw available but de-emphasized.
  const isTerminal = app.status === "selected" || app.status === "rejected"
  // Resilient reapply: offer it whenever the app is withdrawn + in-app apply,
  // driven by status/apply_method (not can_apply) so it can't silently vanish
  // if can_apply is momentarily stale. can_apply only gates enabled vs disabled
  // — the server stays the real gate on submit.
  const showReapply = isWithdrawn && r.apply_method === "goatza"
  const reapplyEnabled = showReapply && r.can_apply

  const doWithdraw = () => {
    withdraw(
      { applicationId: app.id, recruitmentId: r.id },
      {
        onSuccess: () => {
          setConfirming(false)
          toast.show({ title: "Application withdrawn", variant: "success" })
        },
        onError: (err) => {
          toast.show({
            title: getApiErrorMessage(err, "Couldn't withdraw. Please try again."),
            variant: "error",
          })
        },
      }
    )
  }

  return (
    <div className={`${styles.appBanner} ${styles[meta.colorClass]}`}>
      <span className={styles.appBannerIcon}><Icon icon={meta.icon} width={22} height={22} /></span>
      <div className={styles.appBannerText}>
        <span className={styles.appBannerLabel}>Your Application</span>
        <span className={styles.appBannerStatus}>{meta.label}</span>
        {app.applied_at && !isWithdrawn && (
          <span className={styles.appBannerDate}>Applied {dayjs(app.applied_at).fromNow()}</span>
        )}
      </div>

      <div className={styles.appBannerActions}>
        {showReapply && (
          <button
            className={`${styles.appReapplyBtn} ${reapplyEnabled ? "" : styles.appReapplyDisabled}`}
            onClick={reapplyEnabled ? onReapply : undefined}
            disabled={!reapplyEnabled}
            type="button"
          >
            <Icon icon="mdi:send-outline" width={15} height={15} />
            Reapply
          </button>
        )}

        {canWithdraw && !confirming && (
          <button
            className={`${styles.appWithdrawBtn} ${isTerminal ? styles.appWithdrawMuted : ""}`}
            onClick={() => setConfirming(true)}
            type="button"
          >
            <Icon icon="mdi:undo-variant" width={15} height={15} />
            Withdraw
          </button>
        )}
      </div>

      {showReapply && !reapplyEnabled && (
        <p className={styles.appReapplyHint}>
          <Icon icon="mdi:information-outline" width={12} height={12} />
          Recruitment is no longer accepting applications
        </p>
      )}

      {canWithdraw && confirming && (
        <div className={styles.appConfirm} role="alertdialog" aria-label="Confirm withdraw">
          <p className={styles.appConfirmText}>
            Withdraw your application? The organization will no longer consider it.
            You can reapply while the recruitment is open.
          </p>
          <div className={styles.appConfirmActions}>
            <button
              className={styles.appConfirmCancel}
              onClick={() => setConfirming(false)}
              disabled={isPending}
              type="button"
            >
              Keep
            </button>
            <button
              className={styles.appConfirmConfirm}
              onClick={doWithdraw}
              disabled={isPending}
              type="button"
            >
              {isPending
                ? <span className={styles.appConfirmSpinner} aria-hidden="true" />
                : <Icon icon="mdi:undo-variant" width={15} height={15} />}
              Withdraw
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Age group chip ─────────────────────────────────────────────

// Purely informational. Deliberately says nothing about whether the person
// reading it qualifies — eligibility is verified at the venue, never here.
function AgeGroupChip({ category }: { category: RecruitmentAgeCategory }) {
  const range = formatBirthYears(category.min_birth_year, category.max_birth_year)
  return (
    <div className={styles.eligChip}>
      <span className={styles.eligChipTitle}>{category.title}</span>
      {range && <span className={styles.eligChipDetail}>{range}</span>}
      {category.reporting_time && (
        <span className={styles.eligChipTime}>
          <Icon icon="mdi:clock-outline" width={11} height={11} />
          Report by {formatReportingTime(category.reporting_time)}
        </span>
      )}
    </div>
  )
}

// ── Apply CTA block ────────────────────────────────────────────

function ApplyCTA({
  r,
  deadlinePast,
  compact = false,
  onApply,
}: {
  r: TRecruitmentDetail
  deadlinePast: boolean
  compact?: boolean
  onApply?: () => void
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
        <button className={styles.btnApply} type="button" onClick={onApply}>
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
}

export default function RecruitmentDetail({
  recruitmentId,
  isOrgView = false,
  onEdit,
}: RecruitmentDetailProps) {
  const { data, isLoading, isError } = useRecruitmentDetail(recruitmentId)
  const toggleSave = useToggleSaveRecruitment()
  const { toProfile } = useNavigation()
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

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
  // Straight off the detail payload — the mutation flips it in this very cache
  // entry, so no local state can drift from it.
  const isSaved = r.is_saved === true
  const typeMeta   = TYPE_META[r.recruitment_type]   ?? TYPE_META.open_trial
  const statusMeta = r.status ? (STATUS_META[r.status] ?? STATUS_META.draft) : null
  const deadlinePast = isDeadlinePast(r.application_deadline)

  // Owner status control: only offer transitions valid for the current status.
  const orgStatus = r.status ?? "draft"
  const canChangeStatus = (STATUS_TRANSITIONS[orgStatus] ?? []).length > 0

  const allPositions = r.positions ?? []
  const hasPositions = allPositions.length > 0

  const ageCategories   = r.age_categories  ?? []
  const contacts        = r.contacts        ?? []
  const benefits        = r.benefits        ?? []
  const requirements    = r.requirements    ?? []
  const eligibilityCriteria = r.eligibility_criteria ?? []

  return (
    <div className={styles.wrapper}>

      {/* ── Media ── */}
      {(r.media?.length ?? 0) > 0 && <DetailMediaCarousel media={r.media} />}

      {/* ── Header card ── */}
      <div className={styles.headerCard}>

        {/* Org row */}
        <Link href={toProfile(r.organization.username, "organization")} className={styles.orgRow}>
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

          <div className={styles.titleHeadRow}>
            <h1 className={styles.title}>{r.title}</h1>
            {/* Bookmark — same control as the card's, first in the icon row
                because it is the only one of the three that changes state. */}
            <button
              className={`${styles.shareIconBtn} ${isSaved ? styles.saveIconBtnOn : ""}`}
              type="button"
              onClick={() => toggleSave.mutate(r.id)}
              aria-pressed={isSaved}
              aria-label={isSaved ? "Remove from saved" : "Save recruitment"}
              title={isSaved ? "Saved" : "Save"}
            >
              <Icon
                icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"}
                width={18}
                height={18}
              />
            </button>
            <button
              className={styles.shareIconBtn}
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share recruitment"
              title="Share"
            >
              <Icon icon="mdi:share-variant-outline" width={18} height={18} />
            </button>
            {/* Report — a sibling icon button rather than a ⋯ menu, because
                Share is the only other action here and a two-item overflow is
                one more tap than the actions are worth. Never in the ORG view:
                that is the club looking at its own listing. */}
            {!isOrgView && (
              <button
                className={styles.shareIconBtn}
                type="button"
                onClick={() => setReportOpen(true)}
                aria-label="Report recruitment"
                title="Report"
              >
                <Icon icon="mdi:flag-outline" width={18} height={18} />
              </button>
            )}
          </div>
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
            <div className={styles.statusChangeWrap}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={() => setStatusMenuOpen((o) => !o)}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={!canChangeStatus}
                title={canChangeStatus ? undefined : "This recruitment is cancelled"}
                aria-haspopup="menu"
                aria-expanded={statusMenuOpen}
              >
                <Icon icon="mdi:swap-horizontal" width={15} height={15} />
                Change Status
              </button>
              {canChangeStatus && statusMenuOpen && (
                <StatusChangeMenu
                  open
                  onClose={() => setStatusMenuOpen(false)}
                  recruitmentId={recruitmentId}
                  currentStatus={orgStatus}
                />
              )}
            </div>
            <Link
              href={`/organization/admin/${r.organization.id}/recruitments/${r.id}?tab=applicants`}
              className={styles.btnPrimary}
            >
              <Icon icon="mdi:account-multiple-outline" width={15} height={15} />
              View Applications
            </Link>
          </div>
        )}

        {/* User: application status banner (withdraw / reapply live here) */}
        {!isOrgView && r.my_application && (
          <ApplicationBanner r={r} onReapply={() => setApplyOpen(true)} />
        )}

        {/* User: apply CTA */}
        {!isOrgView && !r.my_application && (
          <ApplyCTA r={r} deadlinePast={deadlinePast} onApply={() => setApplyOpen(true)} />
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

      {/* ── Who can attend ──
          Eligibility exactly as the organiser wrote it. Nothing here is
          compared against the viewer — no "you qualify" / "you don't". */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon icon="mdi:account-check-outline" width={16} height={16} />
          Who Can Attend
        </h2>

        <div className={styles.eligBlock}>
          <div className={styles.eligRow}>
            <span className={styles.eligRowLabel}>Age</span>
            <div className={styles.eligChips}>
              {ageCategories.length > 0 ? (
                ageCategories.map((cat) => (
                  <AgeGroupChip key={cat.id} category={cat} />
                ))
              ) : (
                <div className={styles.eligChip}>
                  <span className={styles.eligChipTitle}>All ages</span>
                </div>
              )}
            </div>
          </div>

          <div className={styles.eligRow}>
            <span className={styles.eligRowLabel}>Gender</span>
            <div className={styles.eligChips}>
              <div className={styles.eligChip}>
                <span className={styles.eligChipTitle}>
                  {r.gender && r.gender !== "all"
                    ? (GENDER_LABEL[r.gender] ?? r.gender)
                    : "Open"}
                </span>
              </div>
            </div>
          </div>

          {eligibilityCriteria.length > 0 && (
            <div className={styles.eligRow}>
              <span className={styles.eligRowLabel}>Also</span>
              <ul className={styles.eligCriteriaList}>
                {eligibilityCriteria.map((c) => (
                  <li key={c.id} className={styles.eligCriteriaItem}>
                    <Icon icon="mdi:check-circle-outline" width={14} height={14} />
                    {c.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className={styles.eligNote}>
          <Icon icon="mdi:information-outline" width={13} height={13} />
          Set by the organiser and verified at the venue.
        </p>
      </section>

      {/* ── Positions ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon icon="mdi:account-star-outline" width={16} height={16} />
          Positions
        </h2>
        {hasPositions ? (
          <div className={styles.positionsList}>
            {allPositions.map((p) => (
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

      {/* Application questions are intentionally NOT shown here — they're only
          surfaced in the apply modal (ApplyRecruitmentModal) at apply time. */}

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
          {/* Gender lives in "Who Can Attend" — it is eligibility, not a
              loose detail, and showing it twice reads as two rules. */}
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
          <ApplyCTA r={r} deadlinePast={deadlinePast} compact onApply={() => setApplyOpen(true)} />
        </div>
      )}

      {/* ── Apply modal (goatza in-app apply only) ── */}
      {applyOpen && (
        <ApplyRecruitmentModal recruitment={r} onClose={() => setApplyOpen(false)} />
      )}

      {/* ── Report sheet ── */}
      {reportOpen && (
        <ReportSheet
          targetType="recruitment"
          targetId={r.id}
          username={r.organization.username}
          // A recruitment is always org-owned, so the block shortcut points at
          // the club that published it.
          blockTarget={{
            type: "organization",
            id: r.organization.id,
            username: r.organization.username,
            name: r.organization.name,
          }}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* ── Share sheet ── */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{ type: "recruitment", id: r.id }}
        previewNode={
          <RecruitmentSharePreview
            title={r.title}
            orgName={r.organization.name}
            sportName={r.sport.name}
            sportIcon={r.sport.icon_name}
            coverUrl={r.media?.[0]?.thumbnail_url || r.media?.[0]?.file_url || undefined}
          />
        }
      />

    </div>
  )
}