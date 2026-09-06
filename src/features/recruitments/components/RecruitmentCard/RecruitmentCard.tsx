"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import styles from "./RecruitmentCard.module.css"
import { summarizeAgeGroups } from "../../eligibility"
import {
  daysToDeadline,
  formatDistance,
  formatUrgency,
  type UrgencyTone,
} from "../../matchContext"
import { useToggleSaveRecruitment } from "../../hooks/useRecruitments"
import { Recruitment } from "../../services/recruitments.api"

// ── Helpers ───────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  open_trial: "Open Trial",
  player_looking: "Player Looking",
  private_trial: "Private Trial",
  direct_recruitment: "Direct Recruitment",
  scholarship: "Scholarship",
}

const STATUS_META: Record<string, { label: string; colorClass: string }> = {
  active: { label: "Active", colorClass: "statusActive" },
  draft: { label: "Draft", colorClass: "statusDraft" },
  closed: { label: "Closed", colorClass: "statusClosed" },
  cancelled: { label: "Cancelled", colorClass: "statusCancelled" },
}

const TONE_CLASS: Record<UrgencyTone, string> = {
  none: "toneCalm",
  calm: "toneCalm",
  soon: "toneSoon",
  today: "toneToday",
  closed: "toneClosed",
}

/** The one cell placeholder. A missing fact reads as "—", never as a zero. */
const EMPTY = "—"

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

/**
 * "Free" / "₹200" / null when we simply weren't told.
 *
 * Never hard-codes a symbol: the currency is the recruiter's, and an org
 * posting in AED should not read as rupees. A malformed code from an older row
 * falls back to the bare number rather than throwing the card away.
 */
function formatFee(recruitment: Recruitment): string | null {
  if (recruitment.is_paid === false) return "Free"
  if (!recruitment.is_paid || !recruitment.fee_amount) return null

  const amount = Number(recruitment.fee_amount)
  if (!Number.isFinite(amount)) return null

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: recruitment.fee_currency || "INR",
      // Trial fees are whole numbers; ".00" is two characters of noise in a
      // cell that has to stay scannable at a glance.
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return String(amount)
  }
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
  const toggleSave = useToggleSaveRecruitment()

  // Read straight off the payload — list, discover and detail all carry
  // `is_saved`, and the mutation flips it in the cache, so there is nothing to
  // fetch and nothing to hold in local state that could drift from it.
  const isSaved = recruitment.is_saved === true

  const match = recruitment.match
  const titleId = `rec-title-${recruitment.id}`

  // Only ever rendered off the happy path. "ACTIVE" on every public row is
  // pure noise; "DRAFT" on the org's own row is the whole point.
  const statusMeta =
    recruitment.status !== "active" ? STATUS_META[recruitment.status] : null

  // ── Cell 2: venue. The stadium locates a trial, the city only narrows it to
  // a district — so one wins outright and the other becomes the tooltip.
  const venueName = recruitment.venue_name?.trim()
  const city = recruitment.city?.trim()
  const venuePrimary = venueName || city || ""
  const distance =
    match?.distance_km != null ? formatDistance(match.distance_km) : null
  const venueValue = [venuePrimary, distance].filter(Boolean).join(" · ")

  // ── Cell 3: positions, matched ones first. A stable sort keeps the
  // recruiter's own ordering intact behind the promoted ones.
  const matched = new Set(match?.matched_positions ?? [])
  const positions = (recruitment.positions ?? []).map((p) => p.position.name)
  const sortedPositions = [...positions].sort(
    (a, b) => Number(matched.has(b)) - Number(matched.has(a))
  )
  // Two counts because the visible cap is a container query, not a measurement:
  // one tag fits a narrow card, three fit a wide one. Both spans are in the DOM
  // and aria-hidden — the full list is announced from the visually-hidden span,
  // so hiding a tag with `display: none` never costs a screen reader a position.
  const moreNarrow = positions.length - 1
  const moreWide = positions.length - 3

  // ── Cell 4
  const ageSummary = summarizeAgeGroups(recruitment.age_categories)
  const fee = formatFee(recruitment)
  const ageFeeValue = [ageSummary, fee].filter(Boolean).join(" · ")

  // ── Urgency. Derived from the deadline itself whenever we have one, and
  // only otherwise from the server's count: `days_to_deadline` is computed at
  // request time, so a cached page open across the deadline would keep
  // counting down past it. The server's value stays the fallback for payloads
  // that predate the deadline being on the list serializer.
  const days =
    daysToDeadline(recruitment.application_deadline) ??
    match?.days_to_deadline ??
    null
  const urgency = formatUrgency(days)

  // The badge and the urgency line can land on the same words ("Applications
  // closed" from both sides). Say it once.
  const rawBadge = match?.eligibility_badge ?? null
  const badge =
    rawBadge && rawBadge.trim().toLowerCase() === urgency?.label.toLowerCase()
      ? null
      : rawBadge

  const isBestMatch = match?.sport_match === "primary" && match?.position_match === true
  // A muted card, never a disabled one: the posting sank in the ranking and
  // says why. Nothing here touches the Apply button — that stays derived from
  // `is_accepting_applications` on the detail page, server-side.
  const isMuted = match?.is_eligible === false

  const typeLabel = TYPE_LABEL[recruitment.recruitment_type] ?? null

  return (
    <div className={styles.cardWrap}>
      <article
        className={`${styles.card} ${isMuted ? styles.cardMuted : ""}`}
        aria-labelledby={titleId}
      >
        {/* ── Head ── */}
        <div className={styles.head}>
          {(showOrg || isBestMatch || statusMeta) && (
            <div className={styles.headTop}>
              {showOrg && (
                <Link
                  href={toProfile(
                    recruitment.organization.username,
                    "organization"
                  )}
                  className={styles.orgLink}
                >
                  <Avatar
                    src={recruitment.organization.logo}
                    initials={recruitment.organization.name
                      ?.slice(0, 2)
                      .toUpperCase()}
                    size="sm"
                  />
                  <span className={styles.orgName}>
                    {/* The text truncates on its own element: ellipsis has no
                        effect on a flex container, and the row has to be flex
                        to keep the tick beside the name. */}
                    <span className={styles.orgNameText}>
                      {recruitment.organization.name}
                    </span>
                    {recruitment.organization.is_verified && (
                      <Icon
                        icon="mdi:check-decagram"
                        width={13}
                        height={13}
                        className={styles.verifiedBadge}
                      />
                    )}
                  </span>
                </Link>
              )}

              {isBestMatch && (
                <span className={styles.bestMatch}>Best match</span>
              )}

              {statusMeta && (
                <span
                  className={`${styles.statusBadge} ${styles[statusMeta.colorClass]}`}
                >
                  {statusMeta.label}
                </span>
              )}
            </div>
          )}

          <Link href={toRecruitment(recruitment.id)} className={styles.titleLink}>
            <h3 id={titleId} className={styles.title}>
              {recruitment.title}
            </h3>
          </Link>
        </div>

        {/* ── Urgency. ONE node — the container query moves it beside the
            title on a wide card and down into the footer on a narrow one.
            Rendering it twice and hiding one would say it twice aloud. ── */}
        <div className={styles.urg}>
          {urgency && (
            <span
              className={`${styles.urgency} ${styles[TONE_CLASS[urgency.tone]]}`}
            >
              <span className={styles.dot} aria-hidden="true" />
              {urgency.label}
            </span>
          )}
          {badge && <span className={styles.eligibilityBadge}>{badge}</span>}
        </div>

        {/* ── Spec grid. Fixed order, labels always present: a cell that moves
            between cards is what destroyed the alignment this replaces. ── */}
        <div className={styles.body}>
          <div className={styles.cell}>
            <span className={styles.cellLabel}>Trial date</span>
            <span
              className={`${styles.cellValue} ${!recruitment.event_date ? styles.cellEmpty : ""}`}
            >
              {recruitment.event_date
                ? dayjs(recruitment.event_date).format("D MMM YYYY")
                : EMPTY}
            </span>
          </div>

          <div className={styles.cell}>
            <span className={styles.cellLabel}>Venue</span>
            <span
              className={`${styles.cellValue} ${!venueValue ? styles.cellEmpty : ""}`}
              title={venueName && city ? city : venueValue || undefined}
            >
              {venueValue || EMPTY}
            </span>
          </div>

          <div className={styles.cell}>
            <span className={styles.cellLabel}>Positions</span>
            {positions.length === 0 ? (
              <span className={styles.cellValue}>All positions</span>
            ) : (
              <span className={styles.cellValue}>
                <span className={styles.srOnly}>
                  {sortedPositions.join(", ")}
                </span>
                <span className={styles.tagRow} aria-hidden="true">
                  {sortedPositions.map((name, i) => (
                    <span
                      key={`${name}-${i}`}
                      className={`${styles.tag} ${matched.has(name) ? styles.hit : ""}`}
                    >
                      {name}
                    </span>
                  ))}
                  {moreNarrow > 0 && (
                    <span className={styles.moreNarrow}>+{moreNarrow}</span>
                  )}
                  {moreWide > 0 && (
                    <span className={styles.moreWide}>+{moreWide}</span>
                  )}
                </span>
              </span>
            )}
          </div>

          <div className={styles.cell}>
            <span className={styles.cellLabel}>Age · Fee</span>
            <span
              className={`${styles.cellValue} ${!ageFeeValue ? styles.cellEmpty : ""}`}
              title={ageFeeValue || undefined}
            >
              {ageFeeValue || EMPTY}
            </span>
          </div>
        </div>

        {/* ── Footer meta (wide only — the narrow card gives this row to the
            urgency line, which outranks it) ── */}
        <div className={styles.meta}>
          {typeLabel && <span>{typeLabel}</span>}
          {typeLabel && recruitment.applications_count > 0 && (
            <span className={styles.metaDot} aria-hidden="true" />
          )}
          {recruitment.applications_count > 0 && (
            <span>{fmtCount(recruitment.applications_count)} applied</span>
          )}
        </div>

        <div className={styles.cta}>
          {/* Bookmark. Lives in the action row beside Share rather than
              floating over the card: the card's own tap targets are the title
              link and View, and an overlay button would sit on top of one of
              them. */}
          <button
            type="button"
            className={`${styles.shareBtn} ${isSaved ? styles.saveBtnOn : ""}`}
            onClick={() => toggleSave.mutate(recruitment.id)}
            aria-pressed={isSaved}
            aria-label={isSaved ? "Remove from saved" : "Save recruitment"}
            title={isSaved ? "Saved" : "Save"}
          >
            <Icon
              icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"}
              width={16}
              height={16}
            />
          </button>

          <button
            type="button"
            className={styles.shareBtn}
            onClick={() => setShareOpen(true)}
            aria-label="Share recruitment"
            title="Share"
          >
            <Icon icon="mdi:share-variant-outline" width={16} height={16} />
          </button>

          <Link href={toRecruitment(recruitment.id)} className={styles.viewBtn}>
            View
            <Icon icon="mdi:arrow-right" width={14} height={14} />
          </Link>
        </div>
      </article>

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
    </div>
  )
}
