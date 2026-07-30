"use client"

import Link from "next/link"
import clsx from "clsx"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./UserCard.module.css"

/**
 * Minimal, feature-agnostic data contract so this card stays reusable across
 * explore / search / suggestions / network.
 */
export interface UserCardData {
  username: string
  name: string
  headline?: string
  profile_photo?: string
}

interface UserCardProps {
  user: UserCardData
  /** Optional action rendered beneath the body — e.g. a follow button. */
  action?: React.ReactNode
  /** Optional line under the headline — e.g. "city · 3.2 km" in the listing. */
  meta?: React.ReactNode
  /**
   * Optional interactive badge (e.g. the highlights chip). Rendered OUTSIDE the
   * profile link: a button nested in an anchor is invalid HTML and would
   * navigate instead of acting.
   */
  chip?: React.ReactNode
  /** Merged onto the root so consumers (e.g. the vertical grid) can resize it. */
  className?: string
}

export default function UserCard({ user, action, meta, chip, className }: UserCardProps) {
  const { toProfile } = useNavigation()

  return (
    <div className={clsx(styles.card, className)}>
      <Link href={toProfile(user.username, "user")} className={styles.body}>
        <Avatar
          src={user.profile_photo}
          alt={user.name}
          initials={user.name?.slice(0, 2).toUpperCase()}
          size="lg"
          className={styles.avatar}
        />

        <span className={styles.name}>{user.name}</span>

        {user.headline && <p className={styles.headline}>{user.headline}</p>}

        {meta && <span className={styles.meta}>{meta}</span>}
      </Link>

      {chip && <div className={styles.chip}>{chip}</div>}

      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
