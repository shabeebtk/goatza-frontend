"use client"

import Link from "next/link"
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
}

export default function UserCard({ user, action }: UserCardProps) {
  const { toProfile } = useNavigation()

  return (
    <div className={styles.card}>
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
      </Link>

      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
