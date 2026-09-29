"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { thumbSrc } from "@/shared/services/mediaDelivery"
import { useNavigation } from "@/shared/services/navigation.service"
import { recruitmentUrl } from "@/shared/services/recruitmentUrl"
import { useAuthStore } from "@/store/auth.store"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import styles from "./RecruitmentCard.module.css"
import { summarizeAgeGroups } from "../../eligibility"
import { daysToDeadline, formatDistance } from "../../matchContext"
import { useToggleSaveRecruitment } from "../../hooks/useRecruitments"
import { isTrialOver } from "../../trialEnded"
import { Recruitment } from "../../services/recruitments.api"

// ── Variant ───────────────────────────────────────────────────

/**
 * Who is reading this card.
 *
 * "owner" is the club looking at its own listing: it manages, it counts
 * applicants as a reason to tap, and saving its own posting would be
 * meaningless. "viewer" is everybody else: they apply, the count is social
 * proof, and the bookmark is theirs.
 */
export type RecruitmentCardVariant = "owner" | "viewer"

// ── Status pill ───────────────────────────────────────────────

/**
 * EXACTLY ONE pill, picked in this order. There used to be three separate
 * badges in three positions — "APPLICATIONS CLOSED" top-right on a wide card
 * and bottom-left on a narrow one, DRAFT / ENDED top-left — which is three
 * places to look for one idea.
 *
 * Amber is reserved for the one that changes daily; "Live" is deliberately
 * quiet, because it is the normal state and not an event.
 */
type PillTone = "draft" | "closing" | "live" | "closed" | "ended"

type Pill = { label: string; tone: PillTone; dot: boolean }

const CLOSING_SOON_DAYS = 7

function pickPill(args: {
  isDraft: boolean
  trialOver: boolean
  accepting: boolean
  days: number | null
}): Pill | null {
  const { isDraft, trialOver, accepting, days } = args

  if (isDraft) return { label: "Draft", tone: "draft", dot: false }

  if (accepting && days !== null && days >= 0 && days <= CLOSING_SOON_DAYS) {
    // "0 days left" is not a thing anybody says.
    const label =
      days === 0 ? "Last day" : days === 1 ? "1 day left" : `${days} days left`
    return { label, tone: "closing", dot: true }
  }

  if (accepting) return { label: "Live", tone: "live", dot: true }
  if (!trialOver) return { label: "Closed", tone: "closed", dot: false }
  return { label: "Ended", tone: "ended", dot: false }
}

const PILL_CLASS: Record<PillTone, string> = {
  draft: "pillDraft",
  closing: "pillClosing",
  live: "pillLive",
  closed: "pillClosed",
  ended: "pillEnded",
}

// ── Helpers ───────────────────────────────────────────────────

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
      // Trial fees are whole numbers; ".00" is two characters of noise.
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return String(amount)
  }
}

// ── Props ─────────────────────────────────────────────────────

interface RecruitmentCardProps {
  recruitment: Recruitment
  /** Show org branding — false when the card is inside the org's own profile */
  showOrg?: boolean
  /**
   * Override the variant. Left off, the card works it out from the ACTING
   * ACTOR — see below. Pass it only where the actor is the wrong answer: the
   * create wizard's preview is on the org's own screen but is showing them
   * what a PLAYER will see.
   */
  variant?: RecruitmentCardVariant
}

// ── Component ─────────────────────────────────────────────────

export default function RecruitmentCard({
  recruitment,
  showOrg = true,
  variant,
}: RecruitmentCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const [shareOpen, setShareOpen] = useState(false)
  const toggleSave = useToggleSaveRecruitment()

  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  /**
   * The variant comes from WHO IS ACTING, never from which page the card is
   * on. A page-derived flag gets the saved list and search wrong the moment an
   * org bookmarks or searches for somebody else's posting — and gets its own
   * listing wrong when it finds its own there.
   *
   * Anything that is not the owning org resolves to "viewer", which is also
   * the safe default a surface gets for free by passing nothing.
   */
  const derived: RecruitmentCardVariant =
    actorType === "organization" && actorId === recruitment.organization.id
      ? "owner"
      : "viewer"
  const resolved = variant ?? derived
  const isOwner = resolved === "owner"

  const isDraft = recruitment.status === "draft"

  // Read straight off the payload — list, discover and detail all carry
  // `is_saved`, and the mutation flips it in the cache, so there is nothing to
  // fetch and nothing to hold in local state that could drift from it.
  const isSaved = recruitment.is_saved === true

  const match = recruitment.match
  const titleId = `rec-title-${recruitment.id}`

  // The trial day has passed. The player lists no longer carry these, but a
  // shortlist keeps what was saved and the org keeps everything.
  const trialOver = isTrialOver(recruitment)

  // Derived from the deadline itself whenever we have one, and only otherwise
  // from the server's count: `days_to_deadline` is computed at request time,
  // so a cached page open across the deadline would keep counting past it.
  const days =
    daysToDeadline(recruitment.application_deadline) ??
    match?.days_to_deadline ??
    null

  /**
   * Whether somebody can still apply — the same three conditions the backend's
   * listing bucket 1 uses (active, trial window open, deadline not passed), so
   * the pill and the server's ordering can never disagree about one row.
   */
  const accepting =
    recruitment.status === "active" && !trialOver && (days === null || days >= 0)

  const pill = pickPill({ isDraft, trialOver, accepting, days })

  // A draft is not published, so a viewer has no business seeing one. The
  // server already hides them; this is the client half of the same rule, and
  // it is deliberately keyed on the DERIVED variant — a caller that named the
  // variant itself (the wizard preview, showing the org its own unpublished
  // draft the way a player would see it) is stating intent, not forgetting.
  if (isDraft && variant === undefined && derived === "viewer") return null

  // The stadium locates a trial, the city only narrows it to a district — so
  // one wins outright and the other becomes the tooltip.
  const venueName = recruitment.venue_name?.trim()
  const city = recruitment.city?.trim()
  const venuePrimary = venueName || city || ""
  const distance =
    match?.distance_km != null ? formatDistance(match.distance_km) : null
  const venueValue = [venuePrimary, distance].filter(Boolean).join(" · ")

  // Positions, matched ones first. A stable sort keeps the recruiter's own
  // ordering intact behind the promoted ones.
  const matched = new Set(match?.matched_positions ?? [])
  const positions = (recruitment.positions ?? []).map((p) => p.position.name)
  const sortedPositions = [...positions].sort(
    (a, b) => Number(matched.has(b)) - Number(matched.has(a))
  )
  // Two counts because the visible cap is a container query, not a
  // measurement. Both spans are in the DOM and aria-hidden — the full list is
  // announced from the visually-hidden span, so hiding one costs nothing.
  const moreNarrow = positions.length - 1
  const moreWide = positions.length - 2

  const ageSummary = summarizeAgeGroups(recruitment.age_categories)
  const fee = formatFee(recruitment)
  const ageFeeValue = [ageSummary, fee].filter(Boolean).join(" · ")

  // The trial day if there is one; otherwise the deadline, said as a deadline.
  const date = recruitment.event_date
    ? dayjs(recruitment.event_date).format("ddd, D MMM")
    : recruitment.application_deadline
      ? `Apply by ${dayjs(recruitment.application_deadline).format("D MMM")}`
      : null

  // Informational, never prohibitive. Dropped when the pill already says it.
  const rawBadge = match?.eligibility_badge ?? null
  const badge =
    rawBadge && rawBadge.trim().toLowerCase() === pill?.label.toLowerCase()
      ? null
      : rawBadge

  const isBestMatch =
    match?.sport_match === "primary" && match?.position_match === true
  // A muted card, never a disabled one: the posting sank in the ranking and
  // says why. Nothing here touches Apply — that stays server-derived.
  const isMuted = match?.is_eligible === false

  const cover = recruitment.cover_media ?? null
  const coverSrc = cover ? thumbSrc(cover) : ""
  const photoCount = recruitment.media_count ?? 0
  const isLookingForPlayers = recruitment.recruitment_type === "player_looking"

  const actionLabel = isOwner
    ? trialOver ? "Results" : "Manage"
    : trialOver ? "View" : accepting ? "Apply" : "View"

  const applications = recruitment.applications_count
  // Owner: the reason to tap, and "0 applicants" is real news to a club.
  // Viewer: social proof — hidden at 0, because "0 applied" is a reason not to
  // be the first one.
  const countLabel = isOwner
    ? `${fmtCount(applications)} applicant${applications === 1 ? "" : "s"}`
    : applications > 0
      ? `${fmtCount(applications)} applied`
      : null

  return (
    <div className={styles.cardWrap}>
      <article
        className={[
          styles.card,
          isMuted ? styles.cardMuted : "",
          isDraft ? styles.cardDraft : "",
          trialOver ? styles.cardEnded : "",
        ].filter(Boolean).join(" ")}
        aria-labelledby={titleId}
      >
        {/* ── Media ── Fixed size in BOTH dimensions, so nothing on the card
            moves when the image arrives, or when it never does. ── */}
        <div className={styles.media}>
          {coverSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- media-domain URL, no loader */}
              <img src={coverSrc} alt="" className={styles.mediaImg} loading="lazy" />
              <span className={styles.mediaScrim} aria-hidden="true" />
              {ageSummary && (
                <span className={`${styles.ageBand} ${styles.ageBandOnPhoto}`}>
                  {ageSummary}
                </span>
              )}
              {photoCount > 1 && (
                <span className={styles.photoCount} aria-hidden="true">
                  <Icon icon="mdi:image-multiple-outline" width={10} height={10} />
                  {photoCount}
                </span>
              )}
            </>
          ) : isDraft ? (
            // Dashed and all but empty on purpose: there is nothing to show
            // yet, and the slot says so rather than pretending otherwise.
            <span className={styles.mediaDraft}>
              <Icon icon="mdi:image-outline" width={22} height={22} />
            </span>
          ) : isLookingForPlayers ? (
            // A different SHAPE from the trial panel below — centred, not
            // cornered — so the two types are told apart before the title is
            // read.
            <span className={styles.mediaSeeking}>
              <Icon icon="mdi:account-search-outline" width={26} height={26} />
              <span className={styles.mediaSeekingText}>Looking for players</span>
            </span>
          ) : (
            <span className={styles.mediaSport}>
              <Icon
                icon={recruitment.sport.icon_name || "mdi:trophy-outline"}
                className={styles.mediaWatermark}
                aria-hidden="true"
              />
              <span className={styles.mediaSportName}>
                {recruitment.sport.name}
              </span>
              {ageSummary && <span className={styles.ageBand}>{ageSummary}</span>}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className={styles.content}>
          {/* DOM order is title-then-pill so it READS that way; the narrow
              layout lifts the pill above with column-reverse, which leaves the
              title its full width without reordering what is announced. */}
          <div className={styles.rowTop}>
            <Link href={toRecruitment(recruitment.id)} className={styles.titleLink}>
              <h3 id={titleId} className={styles.title}>
                {recruitment.title}
              </h3>
            </Link>
            {pill && (
              <span className={`${styles.pill} ${styles[PILL_CLASS[pill.tone]]}`}>
                {pill.dot && <span className={styles.dot} aria-hidden="true" />}
                {pill.label}
              </span>
            )}
          </div>

          {showOrg && (
            <Link
              href={toProfile(recruitment.organization.username, "organization")}
              className={styles.orgLink}
            >
              <Avatar
                src={recruitment.organization.logo}
                initials={recruitment.organization.name?.slice(0, 2).toUpperCase()}
                size="xs"
              />
              <span className={styles.orgNameText}>
                {recruitment.organization.name}
              </span>
              {recruitment.organization.is_verified && (
                <Icon
                  icon="mdi:check-decagram"
                  width={12}
                  height={12}
                  className={styles.verifiedBadge}
                />
              )}
            </Link>
          )}

          {/* ── Facts: icon + value, NO labels. A date already looks like a
              date, and four uppercase micro-labels on every row is forty-four
              labels across eleven cards doing no work at all. ── */}
          <div className={styles.facts}>
            {date && (
              <span className={styles.fact}>
                <Icon icon="mdi:calendar-blank-outline" width={13} height={13} />
                <span className={styles.factText}>{date}</span>
              </span>
            )}
            {venueValue && (
              <span
                className={styles.fact}
                title={venueName && city ? city : venueValue}
              >
                <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                <span className={styles.factText}>{venueValue}</span>
              </span>
            )}
          </div>

          <div className={styles.tagRow}>
            {positions.length > 0 && (
              <>
                <span className={styles.srOnly}>{sortedPositions.join(", ")}</span>
                <span className={styles.tags} aria-hidden="true">
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
              </>
            )}
            {ageFeeValue && <span className={styles.quiet}>{ageFeeValue}</span>}
            {isBestMatch && <span className={styles.bestMatch}>Best match</span>}
            {badge && <span className={styles.quiet}>{badge}</span>}
          </div>

          {/* Pushes the footer to the bottom so two cards side by side line
              their action rows up whatever their content length. */}
          <div className={styles.spacer} aria-hidden="true" />

          <div className={styles.footer}>
            <span className={styles.count}>{countLabel}</span>

            <div className={styles.actions}>
              {/* Bookmark — viewer only; saving your own posting is
                  meaningless. Outside the card's stretched link, or it would
                  swallow the tap. */}
              {!isOwner && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${isSaved ? styles.iconBtnOn : ""}`}
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
              )}

              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setShareOpen(true)}
                aria-label="Share recruitment"
                title="Share"
              >
                <Icon icon="mdi:share-variant-outline" width={16} height={16} />
              </button>

              <Link href={toRecruitment(recruitment.id)} className={styles.actionBtn}>
                {actionLabel}
                <Icon icon="mdi:arrow-right" width={14} height={14} />
              </Link>
            </div>
          </div>
        </div>
      </article>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{ type: "recruitment", id: recruitment.id }}
        shareUrl={recruitmentUrl(recruitment.id)}
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
