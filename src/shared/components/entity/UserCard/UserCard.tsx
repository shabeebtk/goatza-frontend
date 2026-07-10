"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Badge from "@/shared/components/ui/Badge/Badge"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./UserCard.module.css"

/**
 * Minimal data contract so this card stays decoupled from any single feature
 * (explore / search / suggestions / network all map onto it).
 */
export interface UserCardData {
  username: string
  name: string
  role?: string
  headline?: string
  profile_photo?: string
  city?: string
  distance_km?: number | null
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

interface UserCardProps {
  user: UserCardData
}

export default function UserCard({ user }: UserCardProps) {
  const { toProfile } = useNavigation()

  const hasDistance = user.distance_km != null
  const locationLine = hasDistance ? formatDistance(user.distance_km as number) : user.city

  return (
    <Link href={toProfile(user.username, "user")} className={styles.card}>
      <Avatar
        src={user.profile_photo}
        alt={user.name}
        initials={user.name?.slice(0, 2).toUpperCase()}
        size="lg"
        className={styles.avatar}
      />

      <span className={styles.name}>{user.name}</span>

      {user.role && (
        <Badge variant="brand" className={styles.roleBadge}>
          {user.role}
        </Badge>
      )}

      {user.headline && <p className={styles.headline}>{user.headline}</p>}

      {locationLine && (
        <span className={styles.location}>
          <Icon
            icon={hasDistance ? "mdi:map-marker-radius-outline" : "mdi:map-marker-outline"}
            width={13}
            height={13}
            aria-hidden="true"
          />
          <span className={styles.locationText}>{locationLine}</span>
        </span>
      )}
    </Link>
  )
}
