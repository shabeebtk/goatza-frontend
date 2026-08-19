"use client"

/**
 * State 1 — the pitch.
 *
 * Everything above the fold on a phone arriving from an Instagram link: what
 * this is, when it opens, how many are already in, and one button. The form is
 * not shown until it is asked for — nine fields under a headline is a page
 * people scroll past.
 */

import { Icon } from "@iconify/react"

import { Badge, Button } from "@/shared/components/ui"

import { useWaitlistProgress } from "../hooks/useWaitlistStats"
import { LAUNCH_DATE_LABEL } from "../types"
import styles from "./JoinPage.module.css"

const BENEFITS = [
  "A player profile scouts and clubs can actually find",
  "Your best clips on one page, not buried in a chat",
  "Trials and openings across Kerala, in one feed",
] as const

export default function JoinIntro({ onRegister }: { onRegister: () => void }) {
  const { count, goal, percent, isPending } = useWaitlistProgress()

  return (
    <section className={`${styles.state} ${styles.intro}`}>
      <Badge variant="brand" dot>
        Opening {LAUNCH_DATE_LABEL}
      </Badge>

      <h1 className={styles.headline}>
        Kerala&apos;s next football star is{" "}
        <span className={styles.headlineAccent}>already playing</span>
      </h1>

      <p className={styles.sub}>
        Nobody is watching yet. Get on the list before we open, and be one of
        the first players scouts see.
      </p>

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
            {count === null ? "—" : count.toLocaleString("en-IN")}
          </span>
          <span className={styles.counterLabel}>
            of {goal.toLocaleString("en-IN")} spots
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

      <ul className={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <li key={benefit} className={styles.benefit}>
            <span className={styles.benefitIcon} aria-hidden="true">
              <Icon icon="mdi:check-circle" width={18} height={18} />
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className={styles.introCta}>
        <Button variant="brand" size="lg" fullWidth onClick={onRegister}>
          Register as a player
        </Button>
      </div>

      <p className={styles.introFoot}>
        Free, and takes under a minute. We only need your name and number.
      </p>
    </section>
  )
}
