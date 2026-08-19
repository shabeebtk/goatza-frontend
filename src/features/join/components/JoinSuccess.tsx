"use client"

/**
 * State 3 — confirmation, and the ask.
 *
 * The number is the point. "#47" under a founding-player badge is what somebody
 * screenshots, and the three steps under it are the only thing we actually want
 * them to do next: follow, DM clips, get featured.
 *
 * The number shown is the backend's DISPLAY number — it arrives ready to print
 * and nothing here adjusts it.
 *
 * An `already_registered` result renders this SAME screen with a different
 * heading. There is no account to log into, so re-submitting the form is the
 * only way a person can check whether they are on the list — answering that
 * with an error would punish the one action available to them.
 *
 * THE SHARE BLOCK IS THE POINT OF THIS SCREEN, though, not the confirmation.
 * A player who posts their card is an advert for Goatza in front of exactly the
 * people Goatza wants; a player who closes this tab is one signup. So the card
 * is offered three ways, and which one leads is decided by the phone rather
 * than by us — see useCardShare. What never varies is that the caption is
 * available separately from the image, because a downloaded PNG still leaves
 * somebody looking at an empty caption box.
 */

import { Icon } from "@iconify/react"

import { Badge, Button, Card } from "@/shared/components/ui"

import { useCardShare } from "../hooks/useCardShare"
import type { SignupResult } from "../types"
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_URL,
  LAUNCH_DATE_LABEL,
  firstName,
} from "../types"
import styles from "./JoinPage.module.css"

export default function JoinSuccess({ result }: { result: SignupResult }) {
  const {
    caption,
    cardUrl,
    fileName,
    canShareFiles,
    isSharing,
    showCaption,
    share,
    copyCaption,
  } = useCardShare({
    refCode: result.ref_code,
    isFounding: result.is_founding,
  })

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

      {/*
        The badge is the BACKEND's answer, not arithmetic done here. It decides
        the cohort from the display number and the goal, and the card endpoint
        answers the same way — so this badge and the one on a card shared an
        hour later cannot disagree.
      */}
      {result.is_founding && (
        <div className={styles.foundingBadge}>
          <Badge variant="brand" dot>
            Founding player
          </Badge>
        </div>
      )}

      <p className={styles.successMeta}>
        #{result.signup_number}
        {result.city ? ` · ${result.city}` : ""}
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
        {/*
          The native share sheet — image and caption in one tap — where the
          phone supports sharing files. It leads when it exists because it is
          the only path with no manual step in it, and it disappears the moment
          it fails, leaving the two below as the whole offer.
        */}
        {canShareFiles && (
          <Button
            variant="brand"
            size="lg"
            fullWidth
            onClick={share}
            loading={isSharing}
            disabled={isSharing}
            leftIcon={
              <Icon icon="mdi:share-variant-outline" width={20} height={20} />
            }
          >
            {isSharing ? "Opening…" : "Share my card"}
          </Button>
        )}

        {/*
          The card as a file. A plain download link, not a route change: the URL
          is a route handler that returns a PNG, and Button renders an
          <a download> rather than a next/link for exactly that reason.

          Same-origin, so the filename is honoured. On the browsers that ignore
          `download` for a navigated image the card simply opens full-screen,
          where long-press-save is the gesture people already use — a worse
          outcome, never a broken one. It needs no JavaScript at all, which is
          why it is the button that is always here.
        */}
        <Button
          variant={canShareFiles ? "outline" : "brand"}
          size="lg"
          fullWidth
          href={cardUrl}
          download={fileName}
          leftIcon={<Icon icon="mdi:download-outline" width={20} height={20} />}
        >
          Download my story card
        </Button>

        {/* The words to go with it. Half the reason a downloaded card never
            gets posted is the empty caption box next to it. */}
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={copyCaption}
          leftIcon={
            <Icon icon="mdi:content-copy" width={18} height={18} />
          }
        >
          Copy caption
        </Button>

        <Button
          variant="outline"
          size="lg"
          fullWidth
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener"
          leftIcon={<Icon icon="mdi:instagram" width={20} height={20} />}
        >
          Follow @{INSTAGRAM_HANDLE}
        </Button>
      </div>

      {/*
        The clipboard refused, both ways. Rather than a button that appears to
        do nothing, the caption itself — selectable, and selected outright on
        focus so "tap, then copy" is the whole gesture on a phone.

        `readOnly` rather than `disabled`: a disabled textarea cannot be
        selected, which would defeat the entire point of showing it.
      */}
      {showCaption && (
        <div className={styles.captionFallback}>
          <p className={styles.captionHint}>
            Copy this and paste it with your card:
          </p>
          <textarea
            className={styles.captionText}
            value={caption}
            readOnly
            rows={3}
            aria-label="Share caption"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}

    </section>
  )
}
