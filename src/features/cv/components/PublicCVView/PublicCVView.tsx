/**
 * The Sports CV — one page, assembled from data the player already has.
 *
 * A SERVER component. The CV is a document: it has no state, nothing on it
 * depends on who is reading, and the two things that matter most about it —
 * that a crawler and a print dialog both see the finished page — are exactly
 * what server rendering gives for free. The only interactive part, the action
 * row, is a client island (CVActions).
 *
 * ── Section order ─────────────────────────────────────────────
 *
 * Header → Sport → Career → Achievements → Highlights → Footer, which is the
 * order Indian coaches read bio-data in (spec §2.5). Identity first, then what
 * they play, then where they have played it, then what they have won.
 *
 * ── Absent vs empty ───────────────────────────────────────────
 *
 * A section key missing from the payload means the owner switched it off, and
 * the server never sent the data at all — there is nothing here to hide. A key
 * present but empty means they have none yet, which renders nothing either. The
 * distinction is invisible on the page and load-bearing in the payload: an
 * empty list would still sit in the page source for anyone who opened View
 * Source, and that is not privacy.
 *
 * ── Verified marks ────────────────────────────────────────────
 *
 * Imported from CareerEntryCard and AchievementCard rather than rebuilt. There
 * are exactly two verification badges in this app and the CV uses both of them,
 * so the CV cannot drift from the profile it is a summary of.
 */

import Link from "next/link"

import { VerificationLine as AchievementVerification } from "@/features/achievements/components/AchievementCard/AchievementCard"
import { ACHIEVEMENT_LEVEL_LABELS } from "@/features/achievements/achievementMeta"
import { formatAchievedDate } from "@/features/achievements/utils/achievementDates"
import { VerificationLine as CareerVerification } from "@/features/career/components/CareerEntryCard/CareerEntryCard"
import {
  CAREER_ENTRY_TYPE_LABELS,
  CAREER_SQUAD_LEVEL_LABELS,
} from "@/features/career/careerMeta"
import { careerDuration, formatCareerRange } from "@/features/career/utils/careerDates"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { getRoleLabel } from "@/shared/constants/roles"
import {
  experienceLevelLabel,
  heightLabel,
  weightLabel,
} from "../../cvMeta"
import type { PublicCV } from "../../services/cv.api"
import CVActions from "./CVActions"
import styles from "./PublicCVView.module.css"

/**
 * What a visitor sees when a CV URL has no public view.
 *
 * Says nothing about WHY, the same rule the backend follows by answering one
 * 404 for all of: CV disabled, profile private, not a player, no such username.
 * Naming the reason would confirm the account exists, which is what the toggle
 * was turned off to prevent.
 *
 * Unlike the public PROFILE page there is no signed-in fallback to offer: the
 * CV has no authenticated twin, so a missing CV is missing for everybody. The
 * profile link is still worth offering — it may well be public.
 */
function CVUnavailable({ username }: { username: string }) {
  return (
    <div className={styles.unavailable}>
      <span className={styles.unavailableMark} aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h8v2H8zm0 4h5v2H8z" />
        </svg>
      </span>

      <h1 className={styles.unavailableTitle}>This CV isn&apos;t available</h1>
      <p className={styles.unavailableText}>
        The link may be wrong, or this CV may not be public.
      </p>

      <Link href={`/profile/${username}`} className={styles.unavailableLink}>
        Try the profile instead
      </Link>
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

/** One label + value pair. Never rendered for a missing value. */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null

  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

// ── View ──────────────────────────────────────────────────────

export default function PublicCVView({
  username,
  cv,
  url,
}: {
  username: string
  cv: PublicCV | null
  /** The absolute CV URL — copied, QR-encoded, and printed in the footer. */
  url: string
}) {
  if (!cv) return <CVUnavailable username={username} />

  const { profile } = cv
  const displayName = profile.name || profile.username
  const primarySport = profile.primary_sport

  // The positions that belong to the sport this CV is about. A player who also
  // logs cricket must not get a wicket-keeper chip on a football CV.
  const positions = primarySport
    ? profile.positions.filter((p) => p.sport === primarySport.sport)
    : profile.positions

  const location = profile.location
    ? [profile.location.city, profile.location.country_code]
        .filter(Boolean)
        .join(", ")
    : null

  return (
    <article className={styles.sheet}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <Avatar
          src={profile.profile_photo || undefined}
          initials={displayName.slice(0, 2).toUpperCase()}
          alt={displayName}
          size="xl"
          className={styles.photo}
        />

        <div className={styles.headerText}>
          <h1 className={styles.name}>{displayName}</h1>
          <p className={styles.handle}>@{profile.username}</p>

          <div className={styles.badgeRow}>
            <span className={styles.roleBadge}>{getRoleLabel(profile.role)}</span>
            {profile.age_group && (
              <span className={styles.badge}>{profile.age_group}</span>
            )}
            {location && <span className={styles.badge}>{location}</span>}
          </div>

          {profile.headline && (
            <p className={styles.headline}>{profile.headline}</p>
          )}
        </div>
      </header>

      <dl className={styles.factGrid}>
        <Fact label="Height" value={heightLabel(profile.height_cm)} />
        <Fact label="Weight" value={weightLabel(profile.weight_kg)} />
        {/* Phone only, and only when the owner switched it on. There is no
            email here and no toggle that produces one. */}
        {cv.contact && <Fact label="Phone" value={cv.contact.phone} />}
      </dl>

      <CVActions url={url} name={displayName} />

      {/* ── Sport ── */}
      {primarySport && (
        <Section title="Sport">
          <div className={styles.badgeRow}>
            <span className={styles.sportBadge}>{primarySport.sport}</span>
            {primarySport.experience_level && (
              <span className={styles.badge}>
                {experienceLevelLabel(primarySport.experience_level)}
              </span>
            )}
            {positions.map((position) => (
              <span
                key={`${position.sport}-${position.name}`}
                className={
                  position.is_primary
                    ? `${styles.badge} ${styles.badgeStrong}`
                    : styles.badge
                }
              >
                {position.name}
              </span>
            ))}
          </div>

          {/* Sport-agnostic by construction — "Preferred foot" for a
              footballer, "Batting style" for a cricketer, with no code here
              knowing either exists. Absent entirely when show_attributes is
              off. */}
          {primarySport.attributes && primarySport.attributes.length > 0 && (
            <dl className={styles.factGrid}>
              {primarySport.attributes.map((attribute) => (
                <Fact
                  key={attribute.name}
                  label={attribute.name}
                  value={attribute.value}
                />
              ))}
            </dl>
          )}
        </Section>
      )}

      {/* ── Career ── */}
      {cv.career && cv.career.length > 0 && (
        <Section title="Career">
          <ol className={styles.rows}>
            {cv.career.map((entry) => {
              const duration = careerDuration(entry)
              const squadLine = [
                entry.squad_level
                  ? CAREER_SQUAD_LEVEL_LABELS[entry.squad_level]
                  : null,
                entry.age_group || null,
                CAREER_ENTRY_TYPE_LABELS[entry.entry_type],
              ]
                .filter(Boolean)
                .join(" · ")

              return (
                <li key={entry.id} className={styles.row}>
                  <p className={styles.rowPeriod}>
                    {formatCareerRange(entry)}
                    {duration && (
                      <span className={styles.rowMuted}> · {duration}</span>
                    )}
                  </p>
                  <p className={styles.rowTitle}>{entry.title}</p>
                  <p className={styles.rowOrg}>{entry.organization_name}</p>
                  {squadLine && <p className={styles.rowMeta}>{squadLine}</p>}
                  <CareerVerification entry={entry} />
                </li>
              )
            })}
          </ol>
        </Section>
      )}

      {/* ── Achievements ── */}
      {cv.achievements && cv.achievements.length > 0 && (
        <Section title="Achievements">
          <ol className={styles.rows}>
            {cv.achievements.map((achievement) => (
              <li key={achievement.id} className={styles.row}>
                <p className={styles.rowPeriod}>
                  {formatAchievedDate(achievement.achieved_date)}
                </p>
                <p className={styles.rowTitle}>{achievement.title}</p>
                {achievement.event_name && (
                  <p className={styles.rowOrg}>{achievement.event_name}</p>
                )}
                {achievement.level && (
                  <p className={styles.rowMeta}>
                    {ACHIEVEMENT_LEVEL_LABELS[achievement.level]}
                  </p>
                )}
                <AchievementVerification achievement={achievement} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ── Highlights ── */}
      {cv.highlights && cv.highlights.length > 0 && (
        <Section title="Highlights">
          {/* Native <video preload="none">, not a lightbox: the poster IS the
              thumbnail, a tap plays it in place, and it costs no JavaScript and
              no network until somebody presses play. It also degrades to a
              still frame in print, which is the right thing for a printed CV. */}
          <ul className={styles.clips}>
            {cv.highlights.map((clip) => (
              <li key={clip.id} className={styles.clip}>
                <video
                  className={styles.clipVideo}
                  src={clip.file_url}
                  poster={clip.thumbnail_url || undefined}
                  preload="none"
                  controls
                  playsInline
                  aria-label={clip.title || `Highlight by ${displayName}`}
                />
                {clip.title && <p className={styles.clipTitle}>{clip.title}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <Link href={`/profile/${profile.username}`} className={styles.footerLink}>
          View the full profile
        </Link>
        <p className={styles.footerMark}>Made with Goatza</p>
        {/* Screen-hidden, print-only: a printed sheet has no clickable link, so
            the URL has to be readable as text or the page is a dead end. */}
        <p className={styles.printUrl}>{url}</p>
      </footer>
    </article>
  )
}
