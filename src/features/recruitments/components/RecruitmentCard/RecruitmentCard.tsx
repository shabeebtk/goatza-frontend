"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useProgressiveSrc } from "@/shared/hooks/useProgressiveSrc"
import { useNavigation } from "@/shared/services/navigation.service"
import { recruitmentUrl } from "@/shared/services/recruitmentUrl"
import { useAuthStore } from "@/store/auth.store"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import RecruitmentSharePreview from "../RecruitmentSharePreview/RecruitmentSharePreview"
import styles from "./RecruitmentCard.module.css"
import { summarizeAgeGroups } from "../../eligibility"
import { formatDistance } from "../../matchContext"
import { daysToApply, isAcceptingApplications } from "../../accepting"
import { useToggleSaveRecruitment } from "../../hooks/useRecruitments"
import {
  firstLiveSession,
  formatInstant,
  formatSessionDate,
  upcomingSessions,
} from "../../sessionDisplay"
import { FALLBACK_TRIAL_TIME_ZONE, isTrialOver } from "../../trialEnded"
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

// ── Image weight ──────────────────────────────────────────────

/**
 * How many cards get the thumb→full swap (`useProgressiveSrc`).
 *
 * The cover is a 640px thumb on everything uploaded so far, and the poster
 * card hands it the whole width of the phone — so the top of the list is
 * worth upgrading. Doing it to the WHOLE list would download both copies of
 * every row, and these lists are read on mobile data. Two is the top of the
 * first screen in a vertical list and the visible pair in a horizontal rail.
 */
const PROGRESSIVE_CARDS = 2

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
  /**
   * Position in the list this card is part of, and the ONLY thing that
   * decides how hard its cover is fetched: card 0 loads eagerly, cards 0-1
   * upgrade their thumb to the full file, everything below stays lazy on the
   * thumb. Left off (a preview, a one-off) the card takes the cheap path.
   */
  index?: number
}

// ── Component ─────────────────────────────────────────────────

export default function RecruitmentCard({
  recruitment,
  showOrg = true,
  variant,
  index,
}: RecruitmentCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const [shareOpen, setShareOpen] = useState(false)
  const toggleSave = useToggleSaveRecruitment()

  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  const cover = recruitment.cover_media ?? null

  // Hooks before the early return below, always — a draft that renders null
  // for a viewer must not change how many hooks ran.
  const isFirstCard = index === 0
  const coverSrc = useProgressiveSrc(
    cover,
    index !== undefined && index < PROGRESSIVE_CARDS
  )

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

  // Both read through `accepting.ts`, which is the ONE definition of the
  // application window — the Recommended page lists by exactly this rule, and
  // a second copy here is how the pill and that page start disagreeing.
  const days = daysToApply(recruitment)
  const accepting = isAcceptingApplications(recruitment)

  const pill = pickPill({ isDraft, trialOver, accepting, days })

  // A draft is not published, so a viewer has no business seeing one. The
  // server already hides them; this is the client half of the same rule, and
  // it is deliberately keyed on the DERIVED variant — a caller that named the
  // variant itself (the wizard preview, showing the org its own unpublished
  // draft the way a player would see it) is stating intent, not forgetting.
  if (isDraft && variant === undefined && derived === "viewer") return null

  // ── WHERE THIS TRIAL IS, FOR THIS READER ───────────────────
  //
  // A city tour is geocoded at ONE of its stops, so naming the recruitment's
  // own venue showed a Kannur player "Kochi · 6 km": the right number against
  // the wrong place. When the server has worked out which centre this viewer
  // is nearest to, that centre wins the line — its city, its distance, its
  // date — and the same posting reads "Kannur · 6 km · Mon 20 Oct" for one
  // player and "Kochi · 4 km · Thu 16 Oct" for another.
  //
  // With no nearest centre the line is exactly what it always was: the
  // stadium locates a trial, the city only narrows it to a district, so one
  // wins outright and the other becomes the tooltip.
  const venueName = recruitment.venue_name?.trim()
  const city = recruitment.city?.trim()
  const nearestCentre = recruitment.nearest_session

  // The distance the payload carries, in whichever shape it arrived. Both are
  // the same annotation — the plain list reads it off the column, a ranked
  // card off the match object the scorer rounded — so either answers.
  const distanceKm = recruitment.distance_km ?? match?.distance_km ?? null
  const distance = distanceKm != null ? formatDistance(distanceKm) : null

  // The centre's CITY first here, not its venue name: on a tour the city is
  // what a player is scanning for ("does it come to me?"), and the ground's
  // name only matters once they have decided to go.
  const centreName =
    nearestCentre?.city?.trim() || nearestCentre?.venue_name?.trim() || ""

  const venuePrimary = nearestCentre ? centreName : venueName || city || ""
  const venueValue = nearestCentre
    ? [
        venuePrimary,
        // The centre carries its own copy of the number; the card-level one
        // is the same value and the fallback if it is ever absent.
        nearestCentre.distance_km != null
          ? formatDistance(nearestCentre.distance_km)
          : distance,
        // The stage-4 formatter, on the recruitment's OWN calendar.
        formatSessionDate(nearestCentre.date, recruitment.timezone),
      ]
        .filter(Boolean)
        .join(" · ")
    : [venuePrimary, distance].filter(Boolean).join(" · ")

  // "+2 more centres" — quiet, and only where there is more than one place to
  // be. `upcomingSessions` decides what counts as live so this agrees with
  // the dates the apply picker will actually offer.
  const liveCentres = upcomingSessions(
    recruitment.sessions,
    recruitment.timezone,
  )
  const otherCentres = liveCentres.length - 1

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

  // The trial day if there is one; otherwise the deadline, said as a
  // deadline. BOTH read in THE VENUE's zone: a bare dayjs is the browser's
  // (no timezone plugin is installed), which named the wrong calendar day for
  // any trial abroad. The day comes off the first live SESSION — a date-only
  // string and a wall clock, which cannot shift — and falls back to
  // `event_date` only for a payload cached before sessions shipped.
  const timeZone = recruitment.timezone || FALLBACK_TRIAL_TIME_ZONE
  const opening = firstLiveSession(recruitment.sessions)
  const trialDay = opening
    ? formatSessionDate(opening.date, timeZone)
    : formatInstant(recruitment.event_date, timeZone, {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
  const deadlineDay = formatInstant(recruitment.application_deadline, timeZone, {
    day: "numeric",
    month: "short",
  })
  const date = trialDay ?? (deadlineDay ? `Apply by ${deadlineDay}` : null)

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

  const hasCover = !!coverSrc
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
      {/*
        ONE LINK AND THREE BUTTONS, never a nested set. The card itself is a
        plain positioned element; the TITLE is the <a> and stretches itself
        over the whole card with ::after, and save / share / apply sit above
        that overlay on z-index as controls of their own. Nothing here is a
        div with a role and an onClick.
      */}
      <article
        className={[
          styles.card,
          hasCover ? "" : styles.cardNoMedia,
          isMuted ? styles.cardMuted : "",
          isDraft ? styles.cardDraft : "",
          trialOver ? styles.cardEnded : "",
        ].filter(Boolean).join(" ")}
        aria-labelledby={titleId}
      >
        {/* ── Media ──
            As a ROW its box is fixed in both dimensions, so nothing moves
            when the image arrives or when it never does. As a POSTER it IS
            the card: the aspect-ratio on the card reserves the whole box
            before the image lands, and the image fills it. ── */}
        <div className={styles.media}>
          {hasCover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- media-domain URL, no loader */}
              <img
                src={coverSrc}
                alt=""
                className={styles.mediaImg}
                loading={isFirstCard ? "eager" : "lazy"}
                decoding="async"
              />
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
              <Icon icon="mdi:account-search-outline" className={styles.mediaSeekingIcon} />
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

        {/* THE SCRIM. Poster only, and it is the whole job: white text over a
            photograph nobody vetted. A near-solid panel that fades out, not a
            wash — see the gradient in the stylesheet, which is set against a
            WHITE image rather than the dark sample. */}
        <span className={styles.posterScrim} aria-hidden="true" />

        {/* ── Content ── */}
        <div className={styles.content}>
          {/* DOM order is title-then-pill so it READS that way. The poster
              lifts the pill to the card's top-left corner and the org row
              above the title, both with CSS only — the markup keeps the
              order that belongs in it. */}
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
                className={styles.orgAvatar}
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
              <span className={`${styles.fact} ${styles.factDate}`}>
                <Icon icon="mdi:calendar-blank-outline" width={13} height={13} />
                <span className={styles.factText}>{date}</span>
              </span>
            )}
            {venueValue && (
              <span
                className={`${styles.fact} ${styles.factVenue}`}
                title={
                  nearestCentre
                    ? [nearestCentre.venue_name?.trim(), venueValue]
                        .filter(Boolean)
                        .join(" · ")
                    : venueName && city
                      ? city
                      : venueValue
                }
              >
                <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                <span className={styles.factText}>{venueValue}</span>
              </span>
            )}
          </div>

          {/* Subordinate to the fact above it on purpose: that this trial
              visits four cities is context, and the one it brings to THIS
              reader is the fact. */}
          {otherCentres > 0 && (
            <p className={styles.moreCentres}>
              +{otherCentres} more {otherCentres === 1 ? "centre" : "centres"}
            </p>
          )}

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
              their action rows up whatever their content length. On the
              poster it is what holds the text block against the bottom edge,
              where the scrim is solid. */}
          <div className={styles.spacer} aria-hidden="true" />

          <div className={styles.footer}>
            <span className={styles.count}>{countLabel}</span>

            <div className={styles.actions}>
              {/* Save + share travel together: beside Apply in the row, and
                  lifted to the poster's top-right corner — on their own dark
                  backing, because a translucent control vanishes on a bright
                  poster. */}
              <div className={styles.quickActions}>
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
                      className={styles.iconBtnGlyph}
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
                  <Icon
                    icon="mdi:share-variant-outline"
                    className={styles.iconBtnGlyph}
                  />
                </button>
              </div>

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
