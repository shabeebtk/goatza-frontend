"use client"

/**
 * State 1 — the pitch.
 *
 * Somebody arriving here tapped a link in an Instagram bio and has never heard
 * of Goatza. Everything on this screen answers one of three questions in that
 * order: what is this, what do I get, why now. The form is not shown until it
 * is asked for — nine fields under a headline is a page people scroll past.
 *
 * Two rules this file is built around:
 *
 *   * THE FOUNDING BLOCK MAKES A PROMISE, so it is rendered conditionally.
 *     Premium access and a founding badge are only offered while there are
 *     spots left; once the counter reaches the goal the same block turns into
 *     a plain "join the waitlist" with no claim attached. A page that keeps
 *     advertising something already gone is worse than one that never offered
 *     it.
 *
 *   * THE COUNTER NEVER SHIFTS THE LAYOUT. The number arrives after the first
 *     paint, and the row it lands in reserves its height. No spinner is
 *     inserted and nothing is added or removed when it resolves — which is
 *     also why the perks render while the count is still unknown (see
 *     `foundingOpen`).
 */

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { Badge, Button } from "@/shared/components/ui"

import { useWaitlistProgress } from "../hooks/useWaitlistStats"
import { LAUNCH_DATE_LABEL } from "../types"
import styles from "./JoinPage.module.css"

/**
 * What the platform is, in four lines somebody reads in six seconds.
 *
 * Icons come from the landing page's set (`landing.data.ts`) rather than picked
 * fresh, so the two pages read as one product: a visitor who saw the landing
 * page sees the same four marks for the same four things.
 */
const FEATURES = [
  {
    icon: "mdi:account-star-outline",
    title: "Your player profile",
    line: "Position, stats and clips in one place",
  },
  {
    icon: "mdi:radar",
    title: "Get discovered",
    line: "Clubs, academies and scouts search Goatza directly",
  },
  {
    icon: "mdi:briefcase-search-outline",
    title: "Real opportunities",
    line: "Trials, academy intakes and scholarships in one feed",
  },
  {
    icon: "mdi:message-text-outline",
    title: "Talk directly",
    line: "Message clubs and scouts, no middlemen",
  },
] as const

/** What the first cohort actually gets. Only ever rendered while spots remain. */
const FOUNDING_PERKS = [
  "Premium access, free, after launch",
  "Early access before we open to everyone",
  "A permanent founding player badge on your profile",
] as const

export default function JoinIntro({ onRegister }: { onRegister: () => void }) {
  const { count, goal, percent, isPending } = useWaitlistProgress()

  /**
   * Whether the founding offer is still real.
   *
   * An UNKNOWN count counts as open. The alternative — holding the perks back
   * until the number lands — moves everything below them the moment it does,
   * which is the layout shift this page's counter is carefully built to avoid,
   * and it hides the offer from every visitor whose first paint beats the
   * request. The number is authoritative the instant it arrives, and the honest
   * failure mode of a counter that never loads is that we are still recruiting.
   */
  const foundingOpen = count === null || count < goal

  // Destructured rather than kept as one object: an object holding a ref reads
  // as a ref to the lint rule, and `sticky.pinned` in the JSX below then looks
  // like a ref access during render.
  const { hero: heroAnchor, cta: ctaAnchor, pinned } = useStickyCta()

  return (
    <section className={`${styles.state} ${styles.intro}`}>
      <Badge variant="brand" dot>
        Opening {LAUNCH_DATE_LABEL}
      </Badge>

      <h1 className={styles.headline} ref={heroAnchor}>
        Where the greatest get{" "}
        <span className={styles.headlineAccent}>discovered</span>
      </h1>

      <p className={styles.sub}>
        Talent is everywhere — but scouts can only sign who they can see. Goatza
        makes players findable.
      </p>

      {/* ── What's coming ──────────────────────────────────────── */}

      <h2 className={styles.sectionLabel}>What&apos;s coming</h2>

      <ul className={styles.features}>
        {FEATURES.map((feature) => (
          <li key={feature.title} className={styles.feature}>
            <span className={styles.featureIcon} aria-hidden="true">
              <Icon icon={feature.icon} width={20} height={20} />
            </span>
            <span className={styles.featureText}>
              <span className={styles.featureTitle}>{feature.title}</span>
              <span className={styles.featureLine}>{feature.line}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* ── The founding cohort ────────────────────────────────── */}

      <div className={styles.founding}>
        <h2 className={styles.foundingTitle}>
          {foundingOpen
            ? `The first ${goal.toLocaleString("en-US")} players`
            : "Join the waitlist"}
        </h2>

        {foundingOpen ? (
          <ul className={styles.foundingPerks}>
            {FOUNDING_PERKS.map((perk) => (
              <li key={perk} className={styles.foundingPerk}>
                <span className={styles.foundingCheck} aria-hidden="true">
                  <Icon icon="mdi:check-circle" width={16} height={16} />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        ) : (
          /*
            The founding cohort is full. No perk, no premium, no badge — just
            what is still true: the list is open and it decides the order.
          */
          <p className={styles.foundingClosed}>
            The founding {goal.toLocaleString("en-US")} are in. Register now and
            you&apos;re next in line when Goatza opens.
          </p>
        )}

        {/*
          The counter. `aria-live="polite"` so the number is announced once it
          arrives rather than read as an em-dash and never mentioned again; the
          bar itself is a progressbar with the real values so assistive tech gets
          the ratio, not the pixels.
        */}
        <div className={styles.counter}>
          <p className={styles.counterRow} aria-live="polite">
            <span
              className={`${styles.counterNum} ${
                count === null ? styles.counterNumPending : ""
              }`}
            >
              {count === null ? "—" : count.toLocaleString("en-US")}
            </span>
            <span className={styles.counterLabel}>
              of {goal.toLocaleString("en-US")} spots
            </span>
          </p>

          <div
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={count ?? undefined}
            aria-busy={isPending}
            aria-label="Waitlist spots filled"
          >
            {/*
              Width is 0 until the count lands, so the track renders empty on the
              first paint and fills once. No spinner, nothing added or removed —
              the element is the same element before and after.
            */}
            <span className={styles.barFill} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {/* ── The ask ────────────────────────────────────────────── */}

      <div className={styles.introCta} ref={ctaAnchor}>
        <Button variant="brand" size="lg" fullWidth onClick={onRegister}>
          Register as a player
        </Button>
      </div>

      <p className={styles.introFoot}>
        Free, and takes under a minute. We only need your name and number.
      </p>

      {/*
        The same button again, pinned, on phones only.

        It is rendered ONLY while the real one is off-screen, so the two are
        never both visible and the bar can never cover the content it duplicates
        — scroll to the bottom and it takes itself away. `aria-hidden` because
        the button above it is the same action, already in the tab order and
        already announced; a second copy would be a second thing to skip past.

        Through <Portal>, because `.page` clips on the x axis and a clipping
        ancestor is the containing block for a fixed child: left in place, the
        bar pins to the bottom of the PAGE and scrolls off with it.
      */}
      {pinned && (
        <Portal>
          <div className={styles.stickyCta} aria-hidden="true">
            <Button
              variant="brand"
              size="lg"
              fullWidth
              onClick={onRegister}
              tabIndex={-1}
            >
              Register as a player
            </Button>
          </div>
        </Portal>
      )}
    </section>
  )
}

/**
 * Pins a copy of the CTA to the bottom of the screen while — and only while —
 * the reader is between the hero and the real button.
 *
 * TWO observers, because the rule has two halves and one of them is not about
 * the button at all:
 *
 *   * PAST THE HERO. On a phone the real CTA is far below the fold, so an
 *     observer on the button alone reports "not visible" on the very first
 *     paint and the bar arrives before anybody has scrolled — a page that
 *     opens with a floating button over its own headline. Watching the
 *     headline is what "scrolled past the hero" actually means.
 *
 *   * THE REAL BUTTON IS NOT ON SCREEN. Once it is, the bar retires, so the
 *     two are never both visible and the pinned copy can never cover the
 *     content it duplicates.
 *
 * Observers rather than a scroll listener on a pixel threshold: the threshold
 * is "can they see it", which an observer answers directly and a hard-coded
 * offset only approximates across a 360px phone and a 430px one.
 *
 * No observer, no problem — an environment without one (jsdom, an old browser)
 * simply never pins, and the page still has its CTA where it always was.
 */
function useStickyCta() {
  const hero = useRef<HTMLHeadingElement | null>(null)
  const cta = useRef<HTMLDivElement | null>(null)

  const [pastHero, setPastHero] = useState(false)
  const [ctaVisible, setCtaVisible] = useState(true)

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return

    const observers: IntersectionObserver[] = []

    const watch = (
      element: Element | null,
      onChange: (visible: boolean) => void,
    ) => {
      if (!element) return
      // A sliver counts as visible, at both ends: the bar should be gone before
      // somebody has to wonder which of the two buttons they are meant to press.
      const observer = new IntersectionObserver(
        ([entry]) => onChange(entry.isIntersecting),
        { threshold: 0.1 },
      )
      observer.observe(element)
      observers.push(observer)
    }

    watch(hero.current, (visible) => setPastHero(!visible))
    watch(cta.current, setCtaVisible)

    return () => observers.forEach((observer) => observer.disconnect())
  }, [])

  return { hero, cta, pinned: pastHero && !ctaVisible }
}
