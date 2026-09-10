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
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { posterSrc } from "@/shared/services/mediaDelivery"
import { recruitmentDetailPath } from "@/shared/services/recruitmentUrl"
import { useAuthStore } from "@/store/auth.store"
import { formatBirthYears, formatReportingTime } from "../../eligibility"
import { formatCountdown } from "../../countdown"
import {
  APPLY_METHOD_LABEL,
  BENEFIT_ICONS,
  EXPERIENCE_LABEL,
  GENDER_LABEL,
  TYPE_LABEL,
} from "../../recruitmentCopy"
import type { PublicRecruitmentDetail } from "../../services/publicRecruitment.api"
import RecruitmentShareMenu from "../RecruitmentShareMenu/RecruitmentShareMenu"
import styles from "./PublicRecruitmentView.module.css"

// ── Helpers ───────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string | null {
  return iso ? dayjs(iso).format("D MMM YYYY") : null
}

/**
 * The time, or null when none was set. A "no time" date is stored at end-of-day
 * (23:59); older rows used midnight. Both mean "no time given" and must not
 * render as a real 11:59 PM kick-off. Same rule as RecruitmentDetail.
 */
function fmtTimeOrNull(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = dayjs(iso)
  const noTime =
    (d.hour() === 0 && d.minute() === 0) || (d.hour() === 23 && d.minute() === 59)
  return noTime ? null : d.format("h:mm A")
}

function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const time = fmtTimeOrNull(iso)
  return time ? `${fmtDate(iso)}, ${time}` : fmtDate(iso)
}

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
  const venuePrimary = r.venue_name?.trim() || r.city?.trim() || ""

  // `status` is owner-only and never on this payload, so
  // `is_accepting_applications` — the server's single public verdict over
  // status, deadline and the applications cap — is the only thing that can
  // decide the open/closed treatment here.
  const accepting = r.is_accepting_applications !== false
  const countdown = formatCountdown(
    r.application_deadline,
    accepting ? "active" : "closed"
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
                {[r.city?.trim(), EXPERIENCE_LABEL[r.experience_level]]
                  .filter(Boolean)
                  .join(" · ") || `@${r.organization.username}`}
              </span>
            </span>
          </Link>
        </div>
      </header>

      {/* ── Facts strip. Built as a list and filtered, so an absent fact
             collapses the grid rather than leaving an empty cell. ── */}
      <div className={styles.facts}>
        {r.event_date && (
          <div className={styles.fact}>
            <span className={styles.factK}>Trial</span>
            <b className={styles.factV}>
              {dayjs(r.event_date).format("D MMM").toUpperCase()}
            </b>
            {fmtTimeOrNull(r.event_date) && (
              <small className={styles.factSub}>{fmtTimeOrNull(r.event_date)}</small>
            )}
          </div>
        )}
        {venuePrimary && (
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
          <p className={styles.about}>{r.description || r.short_description}</p>
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
              const detail = [range, reporting].filter(Boolean).join(" · ")
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
          {r.application_deadline && (
            <div className={styles.kvRow}>
              <span className={styles.k}>Applications close</span>
              <span className={styles.v}>{fmtDateTime(r.application_deadline)}</span>
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
            <Icon icon="mdi:lock-outline" width={16} height={16} />
            Applications closed
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
