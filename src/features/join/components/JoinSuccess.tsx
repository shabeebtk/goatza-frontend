"use client"

/**
 * State 3 — confirmation, and the ask.
 *
 * The number is the point. "Founding player #47" is what somebody screenshots,
 * and the three steps under it are the only thing we actually want them to do
 * next: follow, DM clips, get featured.
 *
 * An `already_registered` result renders this SAME screen with a different
 * heading. There is no account to log into, so re-submitting the form is the
 * only way a person can check whether they are on the list — answering that
 * with an error would punish the one action available to them.
 */

import { Icon } from "@iconify/react"

import { Button, Card } from "@/shared/components/ui"

import { buildJoinCardUrl, joinCardFileName } from "../utils/joinCard/cardUrl"
import type { SignupResult } from "../types"
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  LAUNCH_DATE_LABEL,
  districtLabel,
  firstName,
} from "../types"
import styles from "./JoinPage.module.css"

export default function JoinSuccess({ result }: { result: SignupResult }) {
  const district = districtLabel(result.district)

  return (
    <section className={`${styles.state} ${styles.success}`}>
      <span className={styles.successMark} aria-hidden="true">
        <Icon icon="mdi:check-bold" width={30} height={30} />
      </span>

      <h1 className={styles.successTitle}>
        {result.already_registered
          ? "You're already in"
          : `You're in, ${firstName(result.name)}`}
      </h1>

      <p className={styles.successMeta}>
        Founding player #{result.signup_number}
        {district ? ` · ${district}` : ""}
      </p>

      <Card className={styles.stepsCard}>
        <h2 className={styles.stepsTitle}>Now send your videos</h2>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">
              1
            </span>
            <span>
              Follow{" "}
              <span className={styles.stepHandle}>@{INSTAGRAM_HANDLE}</span>
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">
              2
            </span>
            <span>DM 2–3 clips and your name</span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">
              3
            </span>
            <span>Best clips get featured</span>
          </li>
        </ol>
      </Card>

      <p className={styles.whatsappNote}>
        <span className={styles.whatsappIcon} aria-hidden="true">
          <Icon icon="mdi:whatsapp" width={18} height={18} />
        </span>
        <span>
          We&apos;ll message you on WhatsApp on {LAUNCH_DATE_LABEL}, the day
          Goatza opens.
        </span>
      </p>

      <div className={styles.successActions}>
        <Button
          variant="brand"
          size="lg"
          fullWidth
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener"
          leftIcon={<Icon icon="mdi:instagram" width={20} height={20} />}
        >
          Follow @{INSTAGRAM_HANDLE}
        </Button>

        {/*
          The story card. A plain download link, not a route change: the URL is
          a route handler that returns a PNG, and Button renders an <a download>
          rather than a next/link for exactly that reason.

          Same-origin, so the filename is honoured. On the browsers that ignore
          `download` for a navigated image the card simply opens full-screen,
          where long-press-save is the gesture people already use — a worse
          outcome, never a broken one.
        */}
        <Button
          variant="outline"
          size="lg"
          fullWidth
          href={buildJoinCardUrl(result.ref_code)}
          download={joinCardFileName(result.ref_code)}
          leftIcon={<Icon icon="mdi:download-outline" width={20} height={20} />}
        >
          Download my story card
        </Button>
      </div>
    </section>
  )
}
