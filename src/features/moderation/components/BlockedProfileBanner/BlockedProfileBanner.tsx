"use client"

/**
 * What the BLOCKER sees where a profile's action row would be (flow doc §1.5).
 *
 * Replaces Follow / Message entirely rather than sitting above them: leaving
 * a Follow button next to "You blocked this account" offers an action the
 * server refuses, and a 403 the user did not expect reads as a bug.
 *
 * There is no banner for the other direction. Someone who was blocked never
 * reaches this component — their request 404s and the page renders its
 * ordinary not-found state, which is the point.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import { useUnblock } from "../../hooks/useModerationQueries"
import type { BlockTargetType } from "../../services/moderation.api"
import styles from "./BlockedProfileBanner.module.css"

export interface BlockedProfileBannerProps {
  targetType: BlockTargetType
  targetId: string
  username: string
}

export default function BlockedProfileBanner({
  targetType,
  targetId,
  username,
}: BlockedProfileBannerProps) {
  const unblock = useUnblock()
  const [confirming, setConfirming] = useState(false)

  const handleUnblock = () => {
    unblock.mutate(
      { target_type: targetType, target_id: targetId, username },
      { onSettled: () => setConfirming(false) }
    )
  }

  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">
        <Icon icon="mdi:account-cancel-outline" width={20} height={20} />
      </span>

      <div className={styles.text}>
        <p className={styles.title}>You blocked this account</p>
        <p className={styles.hint}>
          They can&apos;t follow you, message you, or see your posts.
        </p>
      </div>

      {confirming ? (
        <div className={styles.confirmRow}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setConfirming(false)}
            disabled={unblock.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleUnblock}
            disabled={unblock.isPending}
          >
            {unblock.isPending ? "Unblocking…" : "Confirm"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.unblockBtn}
          onClick={() => setConfirming(true)}
          aria-label={`Unblock @${username}`}
        >
          Unblock
        </button>
      )}
    </div>
  )
}
