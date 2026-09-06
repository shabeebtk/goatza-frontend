"use client"

/**
 * RecruitmentDetail — the "Matchday Poster" page, in three states.
 *
 * ONE component, three states, chosen from data the page already had:
 *
 *   organiser → `isOrgView` (RecruitmentAdminView passes it; the server picked
 *               the owner serializer for the same request)
 *   applied   → `my_application` is non-null
 *   viewer    → neither
 *
 * The organiser can flip to `previewAsPlayer`, which renders the VIEWER state
 * read-only. That is client-only state and deliberately not a URL param: it is
 * a glance, not a place, and a shared link landing someone in a fake preview
 * would be worse than useless.
 *
 * Structure follows the approved poster mockup: a 4:5 poster hero carrying the
 * title scrim, a bordered facts strip, a countdown row, then FLAT sections —
 * label plus fading rule, no boxed cards — and a sticky action bar whose
 * contents are the state switch. On desktop (≥960px, the app's wide
 * breakpoint) the poster becomes a sticky left column and the sticky bar is
 * replaced by a state card at the top of the right column.
 *
 * Redesign, not a rewrite of logic: apply, withdraw, reapply, status changes,
 * share, report, bookmark and every admin action are the same calls they were,
 * moved. Withdraw/reapply now live in ApplicationSheet — see its header for
 * why there is no application route to send people to.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import MediaLightbox from "@/shared/components/ImageLightbox/MediaLightbox"
import RecruitmentHeroCarousel from "../RecruitmentHeroCarousel/RecruitmentHeroCarousel"
import HeroThumbs from "../RecruitmentHeroCarousel/HeroThumbs"
import ApplyRecruitmentModal from "../ApplyRecruitmentModal/ApplyRecruitmentModal"
import StatusChangeMenu from "../StatusChangeMenu/StatusChangeMenu"
import StatusBadge from "../StatusBadge/StatusBadge"
import ReportSheet from "@/features/moderation/components/ReportSheet/ReportSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import ApplicationSheet from "./ApplicationSheet"
import LatestApplicants from "./LatestApplicants"
import {
  useRecruitmentDetail,
  useToggleSaveRecruitment,
} from "../../hooks/useRecruitments"
import { STATUS_TRANSITIONS } from "../../statusTransitions"
import { formatBirthYears, formatReportingTime } from "../../eligibility"
import { countdownTickMs, formatCountdown, type Countdown } from "../../countdown"
import type {
  RecruitmentDetail as TRecruitmentDetail,
  RecruitmentMedia,
} from "../../services/recruitments.api"
import styles from "./RecruitmentDetail.module.css"

dayjs.extend(relativeTime)

// ── Presentation maps ──────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  open_trial: "Open trial",
  player_looking: "Player looking",
  private_trial: "Private trial",
  direct_recruitment: "Direct recruitment",
  scholarship: "Scholarship",
}

const GENDER_LABEL: Record<string, string> = {
  male: "Male only",
  female: "Female only",
  all: "Open to all",
}

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  followers_only: "Followers only",
  private: "Private",
}

const EXPERIENCE_LABEL: Record<string, string> = {
  district: "District level",
  state: "State level",
  national: "National level",
  beginner: "Beginner",
  inter: "Intermediate",
  advanced: "Advanced",
}

const APPLY_METHOD_LABEL: Record<string, string> = {
  goatza: "Goatza app",
  external: "External link",
  contact: "Contact",
}

const BENEFIT_ICONS: Record<string, string> = {
  coach: "mdi:whistle-outline",
  trophy: "mdi:trophy-outline",
  award: "mdi:medal-outline",
  scholarship: "mdi:school-outline",
  fitness: "mdi:run-fast",
  travel: "mdi:airplane-outline",
  kit: "mdi:tshirt-crew-outline",
  certificate: "mdi:certificate-outline",
}

const ORG_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  closed: "Closed",
  cancelled: "Cancelled",
}

// ── Helpers ────────────────────────────────────────────────────

/** The one cell placeholder. A missing fact reads as "—", never as a zero. */
const EMPTY = "—"

function fmtDate(iso: string | null | undefined, fallback = EMPTY) {
  if (!iso) return fallback
  return dayjs(iso).format("D MMM YYYY")
}

/**
 * The time, or null when none was set.
 *
 * A "no time" date is stored at end-of-day (23:59); older rows used midnight
 * (00:00). Both mean "no time given" and must not render as a real 11:59 PM
 * kick-off.
 */
function fmtTimeOrNull(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = dayjs(iso)
  const noTime =
    (d.hour() === 0 && d.minute() === 0) || (d.hour() === 23 && d.minute() === 59)
  return noTime ? null : d.format("h:mm A")
}

function fmtDateTime(iso: string | null | undefined, fallback = EMPTY) {
  if (!iso) return fallback
  const time = fmtTimeOrNull(iso)
  return time ? `${fmtDate(iso)}, ${time}` : fmtDate(iso)
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function isDeadlinePast(iso: string | null | undefined): boolean {
  if (!iso) return false
  return dayjs(iso).isBefore(dayjs())
}

/**
 * "Free" / "₹200", never a hard-coded symbol: the currency is the recruiter's,
 * and an org posting in AED must not read as rupees.
 */
function formatFee(r: TRecruitmentDetail): string | null {
  if (r.is_paid === false) return "Free"
  if (!r.is_paid || !r.fee_amount) return null
  const amount = Number(r.fee_amount)
  if (!Number.isFinite(amount)) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: r.fee_currency || "INR",
      // Trial fees are whole numbers; ".00" is two characters of noise.
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return String(amount)
  }
}

// ── Countdown chip ─────────────────────────────────────────────

/**
 * Green and pulsing while open, red and still once closed.
 *
 * The clock is state rather than a render-time `Date.now()` so the chip stays
 * honest on a page left open — but it only ticks as fast as the label can
 * change (see `countdownTickMs`), so a posting two days out is not re-rendering
 * every second for a string that moves once an hour.
 */
function useCountdown(
  deadline: string | null | undefined,
  status: string | null | undefined
): Countdown | null {
  const [now, setNow] = useState(() => Date.now())
  const countdown = formatCountdown(deadline, status, now)
  const tick = countdownTickMs(countdown)

  useEffect(() => {
    if (tick == null) return
    const id = window.setInterval(() => setNow(Date.now()), tick)
    return () => window.clearInterval(id)
  }, [tick])

  return countdown
}

/** Must match the `min-width: 960px` block in the stylesheet. */
const DESKTOP_QUERY = "(min-width: 960px)"

/**
 * Which layout is actually on screen.
 *
 * Needed because two controls exist in ONE place each, not two: the bookmark
 * and the organiser's status chip belong to the poster scrim on a phone and to
 * the state card on a desktop. CSS could hide the spare copy, but
 * StatusChangeMenu's desktop dropdown is `position: absolute` against its
 * anchor and its mobile sheet portals to <body> — so a copy hidden with
 * `display: none` between 768px and 960px would open a dropdown inside a
 * hidden ancestor and show the organiser nothing at all.
 *
 * Starts false so the server render and the first client paint agree
 * (mobile-first); the effect corrects it before paint on a wide screen.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    // jsdom ships no matchMedia, and neither does any non-browser renderer.
    // Staying on the mobile arrangement is the right answer there: it is the
    // one that renders every control in a reachable place.
    if (typeof window.matchMedia !== "function") return

    const mq = window.matchMedia(DESKTOP_QUERY)
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return isDesktop
}

function CountdownChip({ countdown }: { countdown: Countdown | null }) {
  if (!countdown) return null
  const closed = countdown.tone === "closed"
  return (
    <span className={`${styles.cd} ${closed ? styles.cdClosed : ""}`}>
      {/* The pulse is the "still open" signal; it stops dead when closed, and
          prefers-reduced-motion turns it off entirely (see the CSS). */}
      {!closed && <i className={styles.cdDot} aria-hidden="true" />}
      {countdown.label}
    </span>
  )
}

// ── Section heading ────────────────────────────────────────────

/** The mockup's `sect`: an uppercase label trailed by a fading rule. */
function Sect({ children }: { children: React.ReactNode }) {
  return <h2 className={styles.sect}>{children}</h2>
}

// ── Facts strip ────────────────────────────────────────────────

type Fact = {
  label: string
  value: string
  sub?: string | null
  href?: string | null
}

/**
 * The bordered 3-up strip under the poster.
 *
 * Absent facts are dropped by the CALLER, not rendered empty — the grid is
 * sized from however many survive, so a free trial with no venue yet collapses
 * to a clean 1-up rather than leaving two dashes behind.
 */
function FactsStrip({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null
  return (
    <div
      className={styles.factRow}
      style={{ gridTemplateColumns: `repeat(${facts.length}, 1fr)` }}
    >
      {facts.map((f) => (
        <div key={f.label} className={styles.fact}>
          <div className={styles.factLabel}>{f.label}</div>
          <div className={styles.factValue}>
            {f.value}
            {f.sub &&
              (f.href ? (
                <a
                  className={styles.factSubLink}
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {f.sub}
                  <Icon icon="mdi:open-in-new" width={10} height={10} />
                </a>
              ) : (
                <small className={styles.factSub}>{f.sub}</small>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Poster hero ────────────────────────────────────────────────

/**
 * The 4:5 poster: carousel, scrim overlay, thumb strip, fullscreen viewer.
 *
 * The overlay slot is `pointer-events: none` by default (see the carousel's
 * CSS), so the scrim cannot swallow the tap that opens fullscreen — only the
 * controls inside it re-enable pointers. That is the whole reason the title
 * treatment can sit on top of a tappable image at all.
 */
function PosterHero({
  media,
  overlay,
}: {
  media: RecruitmentMedia[]
  overlay: React.ReactNode
}) {
  const sorted = useMemo(
    () => [...media].sort((a, b) => a.order - b.order),
    [media]
  )
  const [idx, setIdx] = useState(0)
  // ONE viewer for both the stage and the thumbs — the carousel would open its
  // own if left uncontrolled, and two lightboxes racing the same tap is exactly
  // what `onSlideActivate` exists to prevent.
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  if (sorted.length === 0) return null

  return (
    <div className={styles.poster}>
      <RecruitmentHeroCarousel
        media={sorted}
        index={idx}
        onIndexChange={setIdx}
        onSlideActivate={setViewerIdx}
        overlay={overlay}
        className={styles.posterStage}
      />
      <HeroThumbs
        media={sorted}
        index={idx}
        onSelect={setIdx}
        onActivate={setViewerIdx}
        className={styles.posterThumbs}
      />
      {viewerIdx !== null && (
        <MediaLightbox
          media={sorted}
          startIndex={viewerIdx}
          label="Recruitment media viewer"
          onClose={() => setViewerIdx(null)}
        />
      )}
    </div>
  )
}

// ── Hero scrim ─────────────────────────────────────────────────

/**
 * What sits on the poster: chips, the Bebas title, the org row, and ONE
 * trailing control — the bookmark for a viewer, the status control for the
 * organiser.
 */
function HeroScrim({
  r,
  chips,
  orgTagline,
  trailing,
  toProfile,
}: {
  r: TRecruitmentDetail
  chips: { label: string; accent?: boolean }[]
  orgTagline: string
  trailing: React.ReactNode
  toProfile: (username: string, kind: "organization") => string
}) {
  return (
    <div className={styles.scrim}>
      <div className={styles.scrimInner}>
        {chips.length > 0 && (
          <div className={styles.chipRow}>
            {chips.map((c) => (
              <span
                key={c.label}
                className={`${styles.chip} ${c.accent ? styles.chipAccent : ""}`}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}

        {/* Clamped to two lines so a long title can never push the org row off
            the scrim; the Bebas size steps down at the same time (CSS). */}
        <h1 className={styles.title}>{r.title}</h1>

        <div className={styles.orgLine}>
          <Link
            href={toProfile(r.organization.username, "organization")}
            className={styles.orgLink}
          >
            <Avatar
              src={r.organization.logo}
              initials={r.organization.name?.slice(0, 2).toUpperCase()}
              size="sm"
            />
            <span className={styles.orgText}>
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
              <span className={styles.orgTagline}>{orgTagline}</span>
            </span>
            <Icon icon="mdi:chevron-right" width={16} height={16} />
          </Link>
          {trailing}
        </div>
      </div>
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
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────

interface RecruitmentDetailProps {
  recruitmentId: string
  /** True when the viewer is the owning org — the server agreed, and sent the
   *  owner payload (status, views_count, saves_count, max_applications). */
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

  const [applyOpen, setApplyOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [appSheetOpen, setAppSheetOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false)

  /**
   * `status` is OWNER-ONLY. A viewer looking at a posting the org closed early
   * would otherwise see a green "Closes in 2d" beside a dead "Applications
   * closed" button, because the deadline is still in the future and the chip
   * had no other way to know. `is_accepting_applications` is the server's
   * public verdict, so it stands in for the status the viewer cannot see.
   */
  const effectiveStatus =
    data?.status ?? (data?.is_accepting_applications === false ? "closed" : undefined)
  const countdown = useCountdown(data?.application_deadline, effectiveStatus)
  const isDesktop = useIsDesktop()

  const onReapply = useCallback(() => {
    setAppSheetOpen(false)
    setApplyOpen(true)
  }, [])

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

  // ── State selection ──────────────────────────────────────────
  const isOwner = isOrgView
  // The organiser's preview borrows the VIEWER layout but never its powers.
  const asOrganiser = isOwner && !previewAsPlayer
  const hasApplied = !!r.my_application && !previewAsPlayer && !isOwner
  const isPreview = isOwner && previewAsPlayer

  // ── Open / closed ────────────────────────────────────────────
  const deadlinePast = isDeadlinePast(r.application_deadline)
  const orgStatus = r.status ?? "active"
  const statusClosed = orgStatus === "closed" || orgStatus === "cancelled"
  // `max_applications` is OWNER-ONLY, so a plain viewer cannot tell "full" from
  // "closed" — and must not have to. `is_accepting_applications` is the
  // server's single public verdict over status + deadline + cap, so it drives
  // the viewer's treatment, and the cap is only used to WORD it when we have it.
  const capacityFull =
    r.max_applications != null && (r.applications_count ?? 0) >= r.max_applications
  const accepting = r.is_accepting_applications ?? (!deadlinePast && !statusClosed)
  const closed = !accepting || deadlinePast || statusClosed || capacityFull

  const isSaved = r.is_saved === true
  const fee = formatFee(r)
  const canChangeStatus = (STATUS_TRANSITIONS[orgStatus] ?? []).length > 0
  const applicantsHref = `/organization/admin/${r.organization.id}/recruitments/${r.id}?tab=applicants`

  const allPositions = r.positions ?? []
  const ageCategories = r.age_categories ?? []
  const contacts = r.contacts ?? []
  const benefits = r.benefits ?? []
  const requirements = r.requirements ?? []
  const eligibilityCriteria = r.eligibility_criteria ?? []

  const venuePrimary = r.venue_name?.trim() || r.city?.trim() || ""

  // ── Facts strip ──────────────────────────────────────────────
  // Built as a list and filtered, so an absent fact collapses the grid rather
  // than leaving an empty cell (Part 1 §2).
  const facts: Fact[] = []
  if (r.event_date) {
    facts.push({
      label: "Trial",
      value: dayjs(r.event_date).format("D MMM").toUpperCase(),
      sub: fmtTimeOrNull(r.event_date),
    })
  }
  if (asOrganiser && r.application_deadline) {
    // The organiser's variant swaps Venue for Closes — their question is "how
    // long is this live", not "where do I go".
    facts.push({
      label: "Closes",
      value: dayjs(r.application_deadline).format("D MMM").toUpperCase(),
      sub: countdown?.label.replace(/^Closes /, "") ?? null,
    })
  } else if (venuePrimary) {
    facts.push({
      label: "Venue",
      value: venuePrimary.toUpperCase(),
      sub: r.venue_link ? "map" : r.city && r.venue_name ? r.city : null,
      href: r.venue_link || null,
    })
  }
  if (fee) {
    facts.push({
      label: "Fee",
      value: fee,
      sub: r.is_paid ? r.payment_note?.trim() || "pay at venue" : null,
    })
  }

  const chips: { label: string; accent?: boolean }[] = [
    { label: TYPE_LABEL[r.recruitment_type] ?? r.recruitment_type, accent: true },
  ]
  if (asOrganiser) {
    chips.push({ label: "Organiser view", accent: true })
  } else {
    chips.push({ label: r.sport.name })
    if (r.gender && r.gender !== "all") {
      chips.push({ label: GENDER_LABEL[r.gender] ?? r.gender })
    }
    if (isPreview) chips.push({ label: "Preview" })
  }

  const orgTagline = asOrganiser
    ? `Posted by you · ${fmtDate(r.published_at ?? r.created_at)}`
    : [r.city?.trim(), EXPERIENCE_LABEL[r.experience_level]]
        .filter(Boolean)
        .join(" · ") ||
      r.organization.headline ||
      ""

  const bookmarkBtn = (
    <button
      className={`${styles.scrimIconBtn} ${isSaved ? styles.scrimIconBtnOn : ""}`}
      type="button"
      onClick={() => toggleSave.mutate(r.id)}
      aria-pressed={isSaved}
      aria-label={isSaved ? "Remove from saved" : "Save recruitment"}
      title={isSaved ? "Saved" : "Save"}
    >
      <Icon icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"} width={18} height={18} />
    </button>
  )

  /**
   * The ACTIVE ▾ chip, and the menu it opens. Rendered ONCE — into the poster
   * scrim on a phone, into the card head on a desktop (see `useIsDesktop`).
   * Two copies would install two sets of Esc / click-outside listeners and,
   * worse, could anchor the open dropdown inside a hidden element.
   */
  const statusChip = () => (
    <div className={styles.scrimStatusWrap}>
      <button
        className={styles.statusChip}
        type="button"
        onClick={() => setStatusMenuOpen((o) => !o)}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={!canChangeStatus}
        title={canChangeStatus ? "Change status" : "This recruitment is cancelled"}
        aria-haspopup="menu"
        aria-expanded={statusMenuOpen}
      >
        {ORG_STATUS_LABEL[orgStatus] ?? orgStatus}
        {canChangeStatus && <Icon icon="mdi:chevron-down" width={14} height={14} />}
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
  )

  // ── Shared section blocks ────────────────────────────────────

  const aboutSection = (r.description || r.short_description) && (
    <section className={styles.section}>
      <Sect>About</Sect>
      <p className={styles.aboutP}>{r.description || r.short_description}</p>
    </section>
  )

  const whoSection = (
    <section className={styles.section}>
      <Sect>Who can attend</Sect>
      <div className={styles.chipWrap}>
        {ageCategories.length > 0 ? (
          ageCategories.map((cat) => {
            const range = formatBirthYears(cat.min_birth_year, cat.max_birth_year)
            const reporting = cat.reporting_time
              ? `report ${formatReportingTime(cat.reporting_time)}`
              : null
            const detail = [range, reporting].filter(Boolean).join(" · ")
            return (
              <span key={cat.id} className={styles.chipLg} title={detail || undefined}>
                {cat.title}
                {detail && <small>{detail}</small>}
              </span>
            )
          })
        ) : (
          <span className={styles.chipLg}>All ages</span>
        )}
        <span className={styles.chipLg}>
          {r.gender && r.gender !== "all" ? GENDER_LABEL[r.gender] ?? r.gender : "Open to all"}
        </span>
        {allPositions.length > 0 ? (
          allPositions.map((p) => (
            <span key={p.position.id} className={styles.chipLg}>
              {p.position.name}
            </span>
          ))
        ) : (
          // "All positions" is the welcoming answer, so it gets the green chip.
          <span className={`${styles.chipLg} ${styles.chipLgAccent}`}>All positions</span>
        )}
      </div>
      {eligibilityCriteria.length > 0 && (
        <ul className={styles.critList}>
          {eligibilityCriteria.map((c) => (
            <li key={c.id} className={styles.critItem}>
              <Icon icon="mdi:check-circle-outline" width={14} height={14} />
              {c.title}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.eligNote}>
        <Icon icon="mdi:information-outline" width={12} height={12} />
        Set by the organiser and verified at the venue.
      </p>
    </section>
  )

  const benefitsSection = benefits.length > 0 && (
    <section className={styles.section}>
      <Sect>What you get</Sect>
      <div className={styles.bringList}>
        {benefits.map((b) => (
          <div key={b.id} className={styles.bringRow}>
            <span className={styles.tick}>
              <Icon icon={BENEFIT_ICONS[b.icon_name] ?? "mdi:star-outline"} width={12} height={12} />
            </span>
            {b.title}
          </div>
        ))}
      </div>
    </section>
  )

  const requirementsSection = requirements.length > 0 && (
    <section className={styles.section}>
      <Sect>{hasApplied ? "Bring on trial day" : "Bring with you"}</Sect>
      <div className={styles.bringList}>
        {requirements.map((req, i) => (
          <div key={req.id} className={styles.bringRow}>
            <span className={styles.tick}>{i + 1}</span>
            {req.title}
            <span
              className={`${styles.req} ${req.is_mandatory ? "" : styles.reqOptional}`}
            >
              {req.is_mandatory ? "Required" : "Optional"}
            </span>
          </div>
        ))}
      </div>
    </section>
  )

  const contactSection = contacts.length > 0 && (
    <section className={styles.section}>
      <Sect>Contact</Sect>
      <div className={styles.kvList}>
        {contacts.map((c) => (
          <a
            key={c.id}
            className={styles.kvRow}
            href={c.contact_type === "phone" ? `tel:${c.value}` : `mailto:${c.value}`}
          >
            <span className={styles.k}>
              <Icon
                icon={c.contact_type === "phone" ? "mdi:phone-outline" : "mdi:email-outline"}
                width={13}
                height={13}
              />
              {c.name || (c.contact_type === "phone" ? "Phone" : "Email")}
            </span>
            <span className={`${styles.v} ${styles.vLink}`}>{c.value}</span>
          </a>
        ))}
      </div>
    </section>
  )

  const detailsSection = (
    <section className={styles.section}>
      <Sect>Details</Sect>
      <div className={styles.kvList}>
        {r.experience_level && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Level</span>
            <span className={styles.v}>
              {EXPERIENCE_LABEL[r.experience_level] ?? r.experience_level}
            </span>
          </div>
        )}
        {(r.city || r.location_name) && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Location</span>
            <span className={styles.v}>
              {[r.location_name, r.city, r.country_code].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        {r.is_remote && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Format</span>
            <span className={styles.v}>Remote / online</span>
          </div>
        )}
        <div className={styles.kvRow}>
          <span className={styles.k}>Apply via</span>
          <span className={styles.v}>
            {APPLY_METHOD_LABEL[r.apply_method] ?? r.apply_method}
          </span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.k}>Visibility</span>
          <span className={styles.v}>{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</span>
        </div>
        {r.application_deadline && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Applications close</span>
            <span className={styles.v}>{fmtDateTime(r.application_deadline)}</span>
          </div>
        )}
        {(r.applications_count ?? 0) > 0 && !asOrganiser && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Applicants</span>
            <span className={styles.v}>{fmtCount(r.applications_count)} registered</span>
          </div>
        )}
        {r.is_paid && r.payment_note && (
          <div className={styles.kvRow}>
            <span className={styles.k}>Payment</span>
            <span className={styles.v}>{r.payment_note}</span>
          </div>
        )}
        {/* Owner-only provenance — the old page's Timestamps section, folded in
            rather than dropped. */}
        {asOrganiser && (
          <>
            <div className={styles.kvRow}>
              <span className={styles.k}>Created</span>
              <span className={styles.v}>{fmtDateTime(r.created_at)}</span>
            </div>
            {r.published_at && (
              <div className={styles.kvRow}>
                <span className={styles.k}>Published</span>
                <span className={styles.v}>{fmtDateTime(r.published_at)}</span>
              </div>
            )}
            {r.updated_at && (
              <div className={styles.kvRow}>
                <span className={styles.k}>Updated</span>
                <span className={styles.v}>{fmtDateTime(r.updated_at)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )

  // ── Apply control (viewer + preview) ─────────────────────────

  /** The single Apply affordance, in whatever shape this apply_method takes. */
  function applyControl(compact: boolean) {
    const cls = compact ? styles.btnPrimaryCompact : styles.btnPrimary

    if (isPreview) {
      return (
        <button className={cls} type="button" disabled title="Organiser preview">
          <Icon icon="mdi:eye-outline" width={16} height={16} />
          Apply now
        </button>
      )
    }

    if (r.apply_method === "external") {
      return r.external_apply_url && !closed ? (
        <a
          className={cls}
          href={r.external_apply_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon icon="mdi:open-in-new" width={16} height={16} />
          Apply on site
        </a>
      ) : (
        <button className={cls} type="button" disabled>
          <Icon icon="mdi:link-off" width={16} height={16} />
          {closed ? "Applications closed" : "Link unavailable"}
        </button>
      )
    }

    if (r.apply_method === "contact") {
      const first = contacts[0]
      return first && !closed ? (
        <a
          className={cls}
          href={first.contact_type === "phone" ? `tel:${first.value}` : `mailto:${first.value}`}
        >
          <Icon
            icon={first.contact_type === "phone" ? "mdi:phone" : "mdi:email-outline"}
            width={16}
            height={16}
          />
          Contact to apply
        </a>
      ) : (
        <button className={cls} type="button" disabled>
          <Icon icon="mdi:phone-off" width={16} height={16} />
          {closed ? "Applications closed" : "Contact unavailable"}
        </button>
      )
    }

    if (closed || !r.can_apply) {
      return (
        <button className={cls} type="button" disabled>
          <Icon icon="mdi:lock-outline" width={16} height={16} />
          {capacityFull ? "Applications full" : closed ? "Applications closed" : "Not open"}
        </button>
      )
    }

    return (
      <button className={cls} type="button" onClick={() => setApplyOpen(true)}>
        <Icon icon="mdi:send-outline" width={16} height={16} />
        Apply now
      </button>
    )
  }

  /** Closed → the bookmark stops being a nicety and becomes the next action. */
  const saveNudge = closed && !hasApplied && !asOrganiser && (
    <button
      className={styles.saveNudge}
      type="button"
      onClick={() => toggleSave.mutate(r.id)}
      aria-pressed={isSaved}
    >
      <Icon icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"} width={15} height={15} />
      {isSaved ? "Saved for next season" : "Save it for next season"}
    </button>
  )

  const shareBtn = (
    <button
      className={styles.iconBtn}
      type="button"
      onClick={() => setShareOpen(true)}
      aria-label="Share recruitment"
      title="Share"
    >
      <Icon icon="mdi:share-variant-outline" width={18} height={18} />
    </button>
  )

  const capacityPct =
    r.max_applications && r.max_applications > 0
      ? Math.min(100, Math.round(((r.applications_count ?? 0) / r.max_applications) * 100))
      : null

  const statRow = (
    <div className={styles.statRow}>
      <div className={styles.stat}>
        <b>{fmtCount(r.views_count ?? 0)}</b>
        <span>views</span>
      </div>
      <div className={styles.stat}>
        <b>{fmtCount(r.applications_count ?? 0)}</b>
        <span>applied</span>
      </div>
      <div className={styles.stat}>
        <b>{fmtCount(r.saves_count ?? 0)}</b>
        <span>saves</span>
      </div>
      {capacityPct != null && (
        <div className={`${styles.stat} ${styles.statWide}`}>
          <b>{capacityPct}%</b>
          <span>of {r.max_applications} cap</span>
        </div>
      )}
    </div>
  )

  const capacityBar = r.max_applications != null && r.max_applications > 0 && (
    <div className={styles.cap}>
      <div className={styles.capHead}>
        <span>Capacity</span>
        <span>
          <b>{r.applications_count ?? 0}</b> / {r.max_applications} applications
        </span>
      </div>
      <div className={styles.capBar}>
        <i style={{ width: `${capacityPct}%` }} />
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      {/* ── Left column on desktop: the sticky poster ── */}
      <div className={styles.posterCol}>
        {(r.media?.length ?? 0) > 0 ? (
          <PosterHero
            media={r.media}
            overlay={
              <HeroScrim
                r={r}
                chips={chips}
                orgTagline={orgTagline}
                toProfile={toProfile}
                trailing={isDesktop ? null : asOrganiser ? statusChip() : bookmarkBtn}
              />
            }
          />
        ) : (
          // No media at all: the scrim still has to carry the identity, so it
          // gets the brand treatment on its own rather than a blank box.
          <div className={`${styles.poster} ${styles.posterEmpty}`}>
            <HeroScrim
              r={r}
              chips={chips}
              orgTagline={orgTagline}
              toProfile={toProfile}
              trailing={isDesktop ? null : asOrganiser ? statusChip() : bookmarkBtn}
            />
          </div>
        )}
      </div>

      {/* ── Right column on desktop ── */}
      <div className={styles.mainCol}>
        {/* The desktop state card. Mobile gets the sticky bar instead — the
            same actions, in the shape each viewport can carry. */}
        <div className={styles.stateCard}>
          {asOrganiser ? (
            <>
              <div className={styles.cardHead}>
                {isDesktop && statusChip()}
                <span className={styles.cardHint}>draft · active · closed · cancelled</span>
                <CountdownChip countdown={countdown} />
              </div>
              {statRow}
              {capacityBar}
              <div className={styles.cardActions}>
                <Link href={applicantsHref} className={styles.btnPrimary}>
                  <Icon icon="mdi:account-multiple-outline" width={16} height={16} />
                  View applicants · {fmtCount(r.applications_count ?? 0)}
                </Link>
                <button className={styles.btnSecondary} type="button" onClick={onEdit}>
                  <Icon icon="mdi:pencil-outline" width={15} height={15} />
                  Edit recruitment
                </button>
              </div>
              <div className={styles.cardMeta}>
                <button
                  className={styles.metaBtn}
                  type="button"
                  onClick={() => setPreviewAsPlayer(true)}
                >
                  <Icon icon="mdi:eye-outline" width={13} height={13} />
                  Preview as player
                </button>
                <button className={styles.metaBtn} type="button" onClick={() => setShareOpen(true)}>
                  <Icon icon="mdi:share-variant-outline" width={13} height={13} />
                  Share
                </button>
                {canChangeStatus && (
                  <button
                    className={`${styles.metaBtn} ${styles.metaBtnDanger}`}
                    type="button"
                    onClick={() => setStatusMenuOpen(true)}
                  >
                    Close applications
                  </button>
                )}
              </div>
            </>
          ) : hasApplied ? (
            <>
              <div className={styles.appliedHead}>
                <span className={styles.appliedTile}>
                  <Icon icon="mdi:check" width={22} height={22} />
                </span>
                <span className={styles.appliedText}>
                  <span className={styles.appliedT1}>
                    Application sent
                    {r.my_application?.applied_at &&
                      ` · ${fmtDate(r.my_application.applied_at)}`}
                  </span>
                  <span className={styles.appliedT2}>
                    Current status: <StatusBadge status={r.my_application!.status} /> — you&apos;ll
                    be notified on any change
                  </span>
                </span>
                <button
                  className={styles.btnSecondary}
                  type="button"
                  onClick={() => setAppSheetOpen(true)}
                >
                  View application
                </button>
              </div>
              <div className={styles.cardMeta}>
                {r.event_date && (
                  <span>
                    <Icon icon="mdi:calendar" width={13} height={13} />
                    Trial {fmtDateTime(r.event_date)}
                  </span>
                )}
                {venuePrimary &&
                  (r.venue_link ? (
                    <a href={r.venue_link} target="_blank" rel="noopener noreferrer">
                      <Icon icon="mdi:map-marker" width={13} height={13} />
                      {venuePrimary}
                      <Icon icon="mdi:open-in-new" width={10} height={10} />
                    </a>
                  ) : (
                    <span>
                      <Icon icon="mdi:map-marker" width={13} height={13} />
                      {venuePrimary}
                    </span>
                  ))}
                <button
                  className={`${styles.metaBtn} ${styles.metaBtnDanger}`}
                  type="button"
                  onClick={() => setAppSheetOpen(true)}
                >
                  Withdraw
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.cardHead}>
                {fee && (
                  <span className={styles.feeBlock}>
                    <b>{fee}</b>
                    <span>
                      entry fee
                      {r.is_paid && (
                        <>
                          <br />
                          {r.payment_note?.trim() || "pay at venue"}
                        </>
                      )}
                    </span>
                  </span>
                )}
                <CountdownChip countdown={countdown} />
              </div>
              <div className={styles.cardActions}>
                {applyControl(false)}
                {bookmarkBtn}
                {shareBtn}
                {!isPreview && (
                  <button
                    className={styles.iconBtn}
                    type="button"
                    onClick={() => setReportOpen(true)}
                    aria-label="Report recruitment"
                    title="Report"
                  >
                    <Icon icon="mdi:flag-outline" width={18} height={18} />
                  </button>
                )}
              </div>
              {saveNudge}
              {isPreview && (
                <p className={styles.previewHint}>
                  <Icon icon="mdi:information-outline" width={13} height={13} />
                  Organiser preview — this is what applicants see. Apply is disabled.
                  <button
                    className={styles.metaBtn}
                    type="button"
                    onClick={() => setPreviewAsPlayer(false)}
                  >
                    Exit preview
                  </button>
                </p>
              )}
              <div className={styles.cardMeta}>
                {r.event_date && (
                  <span>
                    <Icon icon="mdi:calendar" width={13} height={13} />
                    Trial {fmtDateTime(r.event_date)}
                  </span>
                )}
                {venuePrimary &&
                  (r.venue_link ? (
                    <a href={r.venue_link} target="_blank" rel="noopener noreferrer">
                      <Icon icon="mdi:map-marker" width={13} height={13} />
                      {venuePrimary}
                      <Icon icon="mdi:open-in-new" width={10} height={10} />
                    </a>
                  ) : (
                    <span>
                      <Icon icon="mdi:map-marker" width={13} height={13} />
                      {venuePrimary}
                    </span>
                  ))}
                {(r.applications_count ?? 0) > 0 && (
                  <span>
                    <Icon icon="mdi:account-multiple-outline" width={13} height={13} />
                    {fmtCount(r.applications_count)} applied
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Facts strip + status row: MOBILE only. On desktop the state card
            above already carries the fee, the countdown and the trial/venue
            meta, and the mockup's desktop frames show no strip. ── */}
        <FactsStrip facts={facts} />

        <div className={styles.statusRow}>
          <CountdownChip countdown={countdown} />
          {hasApplied ? (
            <>
              <StatusBadge status={r.my_application!.status} />
              {r.my_application?.applied_at && (
                <span className={styles.statusNote}>
                  You applied {fmtDate(r.my_application.applied_at)}
                </span>
              )}
            </>
          ) : (
            (r.applications_count ?? 0) > 0 && (
              <span className={styles.statusNote}>
                {fmtCount(r.applications_count)} applied
              </span>
            )
          )}
        </div>

        {/* Organiser's stats live above the sections on mobile too. */}
        {asOrganiser && (
          <div className={styles.orgStats}>
            {statRow}
            {capacityBar}
          </div>
        )}

        {aboutSection}

        {asOrganiser && (
          <LatestApplicants
            recruitmentId={r.id}
            total={r.applications_count ?? 0}
            applicantsHref={applicantsHref}
          />
        )}

        {asOrganiser && (
          <section className={styles.section}>
            <Sect>Preview as player</Sect>
            <button
              className={styles.previewBtn}
              type="button"
              onClick={() => setPreviewAsPlayer(true)}
            >
              <Icon icon="mdi:eye-outline" width={16} height={16} />
              See exactly what applicants see
              <Icon icon="mdi:arrow-right" width={14} height={14} />
            </button>
          </section>
        )}

        <div className={styles.twoCols}>
          {whoSection}
          {requirementsSection}
          {benefitsSection}
          {detailsSection}
          {contactSection}
        </div>

        {/* Report lives at the foot of the page, not in the sticky bar.
            The mockup's mobile bar has exactly three slots and none of them is
            this — but report has to stay reachable at EVERY width, and the
            desktop card's flag icon is invisible on a phone. Never in the org
            view: that is the club looking at its own listing. */}
        {!isOwner && (
          <button
            className={styles.reportLink}
            type="button"
            onClick={() => setReportOpen(true)}
          >
            <Icon icon="mdi:flag-outline" width={14} height={14} />
            Report this recruitment
          </button>
        )}
      </div>

      {/* ── Sticky bar (mobile) — the state switch ── */}
      <div className={styles.stickyBar}>
        {asOrganiser ? (
          <>
            <Link href={applicantsHref} className={styles.btnPrimaryCompact}>
              View applicants · {fmtCount(r.applications_count ?? 0)}
            </Link>
            <button
              className={styles.iconBtn}
              type="button"
              onClick={onEdit}
              aria-label="Edit recruitment"
              title="Edit"
            >
              <Icon icon="mdi:pencil-outline" width={18} height={18} />
            </button>
            <div className={styles.moreWrap}>
              <button
                className={styles.iconBtn}
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label="More actions"
                title="More"
              >
                <Icon icon="mdi:dots-horizontal" width={18} height={18} />
              </button>
              {moreOpen && (
                <>
                  {/* Click-away layer: a bare menu over a scrolling page is a
                      menu you cannot dismiss without picking something. */}
                  <div
                    className={styles.moreScrim}
                    onClick={() => setMoreOpen(false)}
                    aria-hidden="true"
                  />
                  <div className={styles.moreMenu} role="menu">
                    <button
                      className={styles.moreItem}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        setPreviewAsPlayer(true)
                      }}
                    >
                      <Icon icon="mdi:eye-outline" width={15} height={15} />
                      Preview as player
                    </button>
                    <button
                      className={styles.moreItem}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        setShareOpen(true)
                      }}
                    >
                      <Icon icon="mdi:share-variant-outline" width={15} height={15} />
                      Share
                    </button>
                    {canChangeStatus && (
                      <button
                        className={styles.moreItem}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMoreOpen(false)
                          setStatusMenuOpen(true)
                        }}
                      >
                        <Icon icon="mdi:swap-horizontal" width={15} height={15} />
                        Change status
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : hasApplied ? (
          <>
            <div className={styles.appliedBox}>
              <span className={styles.appliedTile}>
                <Icon icon="mdi:check" width={20} height={20} />
              </span>
              <span className={styles.appliedText}>
                <span className={styles.appliedT1}>Applied</span>
                <span className={styles.appliedT2}>
                  Status: {r.my_application!.status}
                </span>
              </span>
            </div>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={() => setAppSheetOpen(true)}
            >
              View application
            </button>
          </>
        ) : (
          <>
            {fee && (
              <span className={styles.feeBlock}>
                <b>{fee}</b>
                <span>entry fee</span>
              </span>
            )}
            {applyControl(true)}
            {shareBtn}
          </>
        )}
      </div>

      {/* Preview banner: the one thing a preview must never hide is the way
          back out of it. */}
      {isPreview && (
        <button
          className={styles.previewExit}
          type="button"
          onClick={() => setPreviewAsPlayer(false)}
        >
          <Icon icon="mdi:eye-off-outline" width={15} height={15} />
          Exit player preview
        </button>
      )}

      {/* ── Overlays ── */}
      {applyOpen && (
        <ApplyRecruitmentModal recruitment={r} onClose={() => setApplyOpen(false)} />
      )}

      {appSheetOpen && r.my_application && (
        <ApplicationSheet
          r={r}
          onClose={() => setAppSheetOpen(false)}
          onReapply={onReapply}
        />
      )}

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
