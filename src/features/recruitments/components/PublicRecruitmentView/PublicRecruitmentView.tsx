"use client"

/**
 * Bridge between the server-rendered public recruitment page (/r/<id>) and what
 * each visitor should actually get.
 *
 *   signed in  → REDIRECT to /recruitments/<id>, the authenticated detail. That
 *                page has apply, save, the application status and the org's own
 *                admin affordances; re-implementing any of it here would be a
 *                second surface to keep in step, and rendering the anonymous
 *                payload to someone with a session would be a downgrade — they
 *                may be entitled to a followers-only posting this payload never
 *                carried. The redirect fires after the auth bootstrap resolves,
 *                which is also while PublicShell is still showing its skeleton,
 *                so there is no flash of the public page on the way through.
 *
 *   anonymous  → the read-only poster below. Everything that would need an
 *                account — apply, save, send in a message — goes through the
 *                login wall carrying `next=/recruitments/<id>`, so the tap that
 *                opened the wall is honoured on the far side of signing up.
 *                Copy link and Share via… need no account and do their real
 *                work.
 *
 * `recruitment` may be NULL, and that case is why this page does not call
 * notFound(): the anonymous payload must not decide whether the route exists.
 * A draft, a closed trial and a followers-only posting all come back as "not
 * public" — and a signed-in follower is entitled to the last of those — so the
 * server renders the route either way and the branch happens here, where the
 * session is known. Same reasoning as PublicProfileView; see its header.
 *
 * ── Why not reuse <RecruitmentDetail> in a "public mode" ─────
 *
 * It is 1,400 lines of authenticated machinery: it fetches through the axios
 * instance behind React Query (401 for a stranger), and it owns the apply
 * modal, the withdraw sheet, the bookmark mutation, the status state machine,
 * the report sheet and the organiser preview. A public flag would have to
 * thread through all of it, and every one of those paths would then have two
 * meanings. This renders the same facts, read-only, and shares the formatting
 * helpers and copy maps that actually matter (recruitmentCopy.ts) so the two
 * pages cannot start calling the same thing by different names.
 */

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { posterSrc } from "@/shared/services/mediaDelivery"
import { recruitmentDetailPath } from "@/shared/services/recruitmentUrl"
import { useAuthStore } from "@/store/auth.store"
import { ageGroupGenderWord, formatBirthYears, formatReportingTime } from "../../eligibility"
import { formatCountdown } from "../../countdown"
import { FALLBACK_TRIAL_TIME_ZONE, isTrialOver } from "../../trialEnded"
import {
  categoryCentresLine,
  centreCities,
  centresLine,
  firstLiveSession,
  formatInstant,
  formatSessionDate,
  formatSessionTime,
  isMultiPlace,
  liveSessions,
  nearestCentreLine,
} from "../../sessionDisplay"
import {
  APPLY_METHOD_LABEL,
  BENEFIT_ICONS,
  GENDER_LABEL,
  TYPE_LABEL,
} from "../../recruitmentCopy"
import type { PublicRecruitmentDetail } from "../../services/publicRecruitment.api"
import MarkdownLite from "../MarkdownLite/MarkdownLite"
import RecruitmentShareMenu from "../RecruitmentShareMenu/RecruitmentShareMenu"
import TrialDatesList from "../TrialDatesList/TrialDatesList"
import AnnouncementList from "../AnnouncementList/AnnouncementList"
import styles from "./PublicRecruitmentView.module.css"

// ── Helpers ───────────────────────────────────────────────────

/**
 * NO DATE HELPERS HERE, and that is the fix rather than an omission.
 *
 * Every date on this page belongs to the TRIAL, so every one of them is read
 * in the venue's own zone off `r.timezone` — see `trialDay` / `deadlineLine`
 * in the component. A bare `dayjs(iso)` is the BROWSER's zone (no timezone
 * plugin is installed), and the "no time given" sentinel it used to test for
 * was written at the venue: a London trial with no kick-off time rendered as
 * "4:29 AM" the next day for an Indian reader.
 *
 * This page has no viewer-side stamp at all — nothing on it is "posted on",
 * because an anonymous reader has no application and no provenance rows.
 */

/**
 * "Free" / "₹200", never a hard-coded symbol: the currency is the recruiter's,
 * and an org posting in AED must not read as rupees.
 */
function formatFee(r: PublicRecruitmentDetail): string | null {
  if (r.is_paid === false) return "Free"
  if (!r.is_paid || !r.fee_amount) return null
  const amount = Number(r.fee_amount)
  if (!Number.isFinite(amount)) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: r.fee_currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return String(amount)
  }
}

// ── Unavailable ───────────────────────────────────────────────

/**
 * What a visitor sees when a recruitment URL has no public view.
 *
 * Says nothing about WHY — the same rule the backend follows by answering one
 * 404 for a draft, a cancelled posting, a followers-only one and a typo'd
 * uuid. Naming the reason would confirm that a private posting exists.
 *
 * Signing in is still worth offering: a follower of the club may well be able
 * to see it, and that is exactly the case the generic copy is hiding.
 */
function RecruitmentUnavailable({ nextPath }: { nextPath: string }) {
  return (
    <div className={styles.panel}>
      <span className={styles.panelMark} aria-hidden="true">
        <Icon icon="mdi:clipboard-text-off-outline" width={30} height={30} />
      </span>

      <h1 className={styles.panelTitle}>This opportunity isn&apos;t available</h1>
      <p className={styles.panelText}>
        The link may be wrong, or this posting may no longer be open. If you
        have a Goatza account, sign in — you may still be able to see it.
      </p>

      <div className={styles.panelActions}>
        <Link href={authUrlWithNext(nextPath, "login")} className={styles.btnPrimary}>
          Log in
        </Link>
        <Link href="/" className={styles.btnSecondary}>
          Go to Goatza
        </Link>
      </div>
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────

function Sect({ children }: { children: React.ReactNode }) {
  return <h2 className={styles.sectHead}>{children}</h2>
}

// ── Main ──────────────────────────────────────────────────────

export default function PublicRecruitmentView({
  recruitmentId,
  recruitment,
}: {
  recruitmentId: string
  recruitment: PublicRecruitmentDetail | null
}) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  // The in-app detail is the canonical destination for anyone with a session.
  // `replace`, not `push`: /r/<id> is a doorway, and leaving it in the history
  // would make Back bounce the visitor straight through it again.
  const authedPath = recruitmentDetailPath(recruitmentId)

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(authedPath)
  }, [isLoading, isAuthenticated, router, authedPath])

  // PublicShell above is already showing a skeleton; a second one reads as a
  // broken page, and painting the anonymous poster for a split second before
  // the redirect would be worse than painting nothing.
  if (isLoading || isAuthenticated) return null

  if (!recruitment) return <RecruitmentUnavailable nextPath={authedPath} />

  const r = recruitment

  const positions = r.positions ?? []
  const ageCategories = r.age_categories ?? []
  const benefits = r.benefits ?? []
  const requirements = r.requirements ?? []
  const eligibilityCriteria = r.eligibility_criteria ?? []

  const fee = formatFee(r)

  // ── Where and when, read in THE VENUE's zone ─────────────────
  // Off a SESSION, never off `event_date`: a session carries a date-only
  // string and a wall-clock time, which read correctly in any zone.
  const timeZone = r.timezone || FALLBACK_TRIAL_TIME_ZONE
  const liveDateCount = liveSessions(r.sessions).length
  const opening = firstLiveSession(r.sessions)
  // A city tour rather than several days at one ground — see isMultiPlace.
  const multiPlace = isMultiPlace(r)

  // The fallback states the DAY only (a payload cached before sessions
  // shipped): the sentinel cannot be told from a real 11:59 pm kick-off
  // without the zone it was saved in, and a wrong time is worse than none.
  const trialDay = opening
    ? formatSessionDate(opening.date, timeZone)
    : formatInstant(r.event_date, timeZone, { day: "numeric", month: "short" })
  const trialTime = formatSessionTime(opening?.start_time)

  /** The deadline — a real instant, so it genuinely converts. */
  const deadlineLine = formatInstant(r.application_deadline, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const venuePrimary = r.venue_name?.trim() || r.city?.trim() || ""
  // A tour is often pinned at no city of its own, so the line under the org
  // name names the first centre rather than falling straight to the handle.
  const locationLine = r.city?.trim() || centreCities(r)[0] || ""

  // `status` is owner-only and never on this payload, so
  // `is_accepting_applications` — the server's single public verdict over
  // status, deadline and the applications cap — is the only thing that can
  // decide the open/closed treatment here.
  // The trial day itself has passed (`is_trial_over`, or the Kolkata calendar
  // when the payload predates the flag): a banner, no countdown, no apply.
  const trialOver = isTrialOver(r)
  const accepting = r.is_accepting_applications !== false && !trialOver
  const countdown = formatCountdown(
    r.application_deadline,
    accepting ? "active" : "closed",
    // The helper reads the clock itself, as it always has here.
    undefined,
    { trialOver }
  )

  // The first IMAGE, or a video's poster frame. Never a video's own file_url —
  // that would hand an <img> a .mp4.
  const cover = r.media?.find((m) => m.media_type === "image") ?? r.media?.[0]
  const coverSrc = cover
    ? cover.media_type === "video"
      ? posterSrc(cover)
      : cover.file_url
    : ""

  // Every walled action carries `next=/recruitments/<id>` — the AUTHED detail,
  // not this page. One hop fewer on the far side of signing up, and it lands
  // them where apply and save actually live.
  const signUpHref = authUrlWithNext(authedPath, "signup")
  const logInHref = authUrlWithNext(authedPath, "login")

  return (
    <article className={styles.page}>
      {/* ── Poster ── */}
      <header className={styles.hero}>
        {coverSrc ? (
          // Plain <img>, same call RecruitmentHeroCarousel makes: the src is on
          // the media domain and next/image would need it in remotePatterns for
          // no gain on a full-bleed image that is already the right size.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt="" className={styles.heroImg} decoding="async" />
        ) : (
          <div className={styles.heroEmpty} aria-hidden="true" />
        )}

        <div className={styles.scrim}>
          <div className={styles.chips}>
            <span className={`${styles.chip} ${styles.chipAccent}`}>
              {TYPE_LABEL[r.recruitment_type] ?? r.recruitment_type}
            </span>
            <span className={styles.chip}>{r.sport.name}</span>
            {r.gender && r.gender !== "all" && (
              <span className={styles.chip}>{GENDER_LABEL[r.gender] ?? r.gender}</span>
            )}
          </div>

          <h1 className={styles.title}>{r.title}</h1>

          <Link
            href={`/organization/profile/${r.organization.username}`}
            className={styles.org}
          >
            <Avatar
              src={r.organization.logo}
              alt={r.organization.name}
              initials={r.organization.name.slice(0, 2)}
              size="sm"
            />
            <span className={styles.orgText}>
              <span className={styles.orgName}>{r.organization.name}</span>
              <span className={styles.orgSub}>
                {locationLine || `@${r.organization.username}`}
              </span>
            </span>
          </Link>
        </div>
      </header>

      {/* ── Facts strip. Built as a list and filtered, so an absent fact
             collapses the grid rather than leaving an empty cell. ── */}
      <div className={styles.facts}>
        {trialDay && (
          <div className={styles.fact}>
            {/* The FIRST date. TrialDatesList below carries the rest
                whenever there is more than one. */}
            <span className={styles.factK}>{liveDateCount > 1 ? "First date" : "Trial"}</span>
            <b className={styles.factV}>{trialDay.toUpperCase()}</b>
            {(liveDateCount > 1 || trialTime) && (
              <small className={styles.factSub}>
                {liveDateCount > 1 ? `+${liveDateCount - 1} more` : trialTime}
              </small>
            )}
          </div>
        )}
        {/* A CITY TOUR has no one venue, and `venue_name` on it is either
            blank or one ground out of four. How many there are and which
            cities they are in is the fact; TrialDatesList names them all.
            An anonymous reader gets no distance — the server has nowhere to
            measure from — so this is always the city list here. */}
        {multiPlace ? (
          <div className={styles.fact}>
            <span className={styles.factK}>Centres</span>
            <b className={styles.factV}>{`${liveDateCount} centres`.toUpperCase()}</b>
            {(nearestCentreLine(r) ?? centresLine(r)) && (
              <small className={styles.factSub}>
                {nearestCentreLine(r) ?? centresLine(r)}
              </small>
            )}
          </div>
        ) : venuePrimary && (
          <div className={styles.fact}>
            <span className={styles.factK}>Venue</span>
            <b className={styles.factV}>{venuePrimary.toUpperCase()}</b>
            {r.city && r.venue_name && (
              <small className={styles.factSub}>{r.city}</small>
            )}
          </div>
        )}
        {fee && (
          <div className={styles.fact}>
            <span className={styles.factK}>Fee</span>
            <b className={styles.factV}>{fee}</b>
            {r.is_paid && (
              <small className={styles.factSub}>
                {r.payment_note?.trim() || "pay at venue"}
              </small>
            )}
          </div>
        )}
      </div>

      {/* Renders itself only when there are 2+ dates. */}
      <TrialDatesList recruitment={r} className={styles.trialDates} />

      {/* The public page is anonymous, so only "all applicants" updates
          appear here — that is the server's rule, not a prop. */}
      <AnnouncementList recruitmentId={r.id} timeZone={r.timezone} />

      {trialOver && (
        <div className={styles.endedBanner} role="status">
          <Icon icon="mdi:calendar-remove-outline" width={18} height={18} />
          <span>
            <b>This trial has ended.</b> The trial day was{" "}
            {trialDay ?? "before today"};
            applications are no longer taken.
          </span>
        </div>
      )}

      {countdown && (
        <p
          className={`${styles.countdown} ${
            countdown.tone === "closed" ? styles.countdownClosed : ""
          }`}
        >
          <Icon
            icon={countdown.tone === "closed" ? "mdi:lock-outline" : "mdi:timer-outline"}
            width={14}
            height={14}
          />
          {countdown.label}
        </p>
      )}

      {/* ── Body ── */}
      {(r.description || r.short_description) && (
        <section className={styles.section}>
          <Sect>About</Sect>
          <MarkdownLite text={r.description || r.short_description} className={styles.about} />
        </section>
      )}

      <section className={styles.section}>
        <Sect>Who can attend</Sect>
        <div className={styles.chipWrap}>
          {ageCategories.length > 0 ? (
            ageCategories.map((cat) => {
              const range = formatBirthYears(cat.min_birth_year, cat.max_birth_year)
              const reporting = cat.reporting_time
                ? `report ${formatReportingTime(cat.reporting_time)}`
                : null
              // WHO and WHERE — each dropped when it says nothing; see the
              // same block on the signed-in detail page.
              const word = ageGroupGenderWord(cat, r.gender)
              const centres = categoryCentresLine(r, cat)
              const detail = [
                word,
                range,
                centres ? `at ${centres}` : null,
                reporting,
              ].filter(Boolean).join(" · ")
              return (
                <span key={cat.id} className={styles.chipLg}>
                  {cat.title}
                  {detail && <small>{detail}</small>}
                </span>
              )
            })
          ) : (
            <span className={styles.chipLg}>All ages</span>
          )}
          <span className={styles.chipLg}>
            {r.gender && r.gender !== "all"
              ? GENDER_LABEL[r.gender] ?? r.gender
              : "Open to all"}
          </span>
          {positions.length > 0 ? (
            positions.map((p) => (
              <span key={p.position.id} className={styles.chipLg}>
                {p.position.name}
              </span>
            ))
          ) : (
            <span className={`${styles.chipLg} ${styles.chipLgAccent}`}>
              All positions
            </span>
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
        <p className={styles.note}>
          <Icon icon="mdi:information-outline" width={12} height={12} />
          Set by the organiser and verified at the venue.
        </p>
      </section>

      {benefits.length > 0 && (
        <section className={styles.section}>
          <Sect>What you get</Sect>
          <div className={styles.rowList}>
            {benefits.map((b) => (
              <div key={b.id} className={styles.row}>
                <span className={styles.tick}>
                  <Icon
                    icon={BENEFIT_ICONS[b.icon_name] ?? "mdi:star-outline"}
                    width={12}
                    height={12}
                  />
                </span>
                {b.title}
              </div>
            ))}
          </div>
        </section>
      )}

      {requirements.length > 0 && (
        <section className={styles.section}>
          <Sect>Bring with you</Sect>
          <div className={styles.rowList}>
            {requirements.map((req, i) => (
              <div key={req.id} className={styles.row}>
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
      )}

      <section className={styles.section}>
        <Sect>Details</Sect>
        <div className={styles.kvList}>
          {(locationLine || r.location_name) && (
            <div className={styles.kvRow}>
              <span className={styles.k}>Location</span>
              <span className={styles.v}>
                {[r.location_name, locationLine, r.country_code].filter(Boolean).join(", ")}
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
          {r.application_deadline && (
            <div className={styles.kvRow}>
              <span className={styles.k}>Applications close</span>
              <span className={styles.v}>{deadlineLine}</span>
            </div>
          )}
          {(r.applications_count ?? 0) > 0 && (
            <div className={styles.kvRow}>
              <span className={styles.k}>Applicants</span>
              <span className={styles.v}>{r.applications_count} registered</span>
            </div>
          )}
        </div>
        {/* CONTACTS ARE NOT RENDERED HERE, and that is deliberate. The
            organiser's phone number and email are on the payload because the
            authenticated page needs them for the "contact to apply" flow;
            printing them on a page a scraper can read is how a volunteer
            coach's mobile number ends up on a spam list. A stranger applies by
            signing in. */}
      </section>

      {/* ── Action bar ── */}
      <div className={styles.actions}>
        {accepting ? (
          <Link href={signUpHref} className={styles.btnPrimary}>
            <Icon icon="mdi:send-outline" width={16} height={16} />
            Sign up to apply
          </Link>
        ) : (
          <span className={`${styles.btnPrimary} ${styles.btnDisabled}`}>
            <Icon
              icon={trialOver ? "mdi:calendar-remove-outline" : "mdi:lock-outline"}
              width={16}
              height={16}
            />
            {trialOver ? "Trial ended" : "Applications closed"}
          </span>
        )}

        <Link
          href={signUpHref}
          className={styles.iconBtn}
          aria-label="Sign in to save this opportunity"
          title="Save"
        >
          <Icon icon="mdi:bookmark-outline" width={18} height={18} />
        </Link>

        {/* Share needs no account and does its real work — that is the whole
            reason this page exists. "Send in a message" is left out: there is
            no session to send one from. */}
        <RecruitmentShareMenu
          recruitmentId={r.id}
          title={r.title}
          orgName={r.organization.name}
          triggerClassName={styles.iconBtn}
          placement="up"
        />
      </div>

      <p className={styles.footNote}>
        Already on Goatza? <Link href={logInHref}>Log in</Link> to apply, save
        this trial and message the club.
      </p>
    </article>
  )
}
