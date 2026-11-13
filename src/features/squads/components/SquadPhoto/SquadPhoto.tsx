"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"
import clsx from "clsx"

import type { SportBrief } from "../../types"
import styles from "./SquadPhoto.module.css"

const FALLBACK_ICON = "mdi:shield-account-outline"

/**
 * A squad's photo band, or the placeholder when it has none: the raised surface
 * with the sport's own icon, and a quiet "Add a squad photo" only for someone who
 * can add one (squads.manage). The list card and the squad page's banner both use
 * it, so the two never disagree about what a squad without a photo looks like.
 *
 * The band's height is the caller's (`className`); `children` is laid over it —
 * the sport chip on a card, the stats on the page.
 */
export default function SquadPhoto({
  photoUrl,
  sport,
  showAddHint,
  className,
  children,
}: {
  photoUrl: string
  sport: SportBrief
  showAddHint: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={clsx(styles.band, className)}>
      {photoUrl ? (
        // A plain img: the URL is R2's, already sized at upload, and the band
        // crops it with object-fit rather than asking next/image for a variant.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className={styles.photo} loading="lazy" decoding="async" />
      ) : (
        <div className={styles.placeholder} aria-hidden={!showAddHint}>
          <Icon
            icon={sport.icon_name || FALLBACK_ICON}
            width={40}
            height={40}
            className={styles.placeholderIcon}
          />
          {showAddHint && <span className={styles.addHint}>Add a squad photo</span>}
        </div>
      )}
      {children}
    </div>
  )
}

/** The sport's name in a dark chip at the band's top left. */
export function SportChip({ sport }: { sport: SportBrief }) {
  return <span className={styles.sportChip}>{sport.name}</span>
}
