"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import { useNavigation } from "@/shared/services/navigation.service"
import { useNetworkFollow } from "../../hooks/useNetworkFollow"
import type { NetworkListKey } from "../../hooks/useNetworkList"
import type { NetworkRow as NetworkRowData } from "../../services/connections.api"
import styles from "./NetworkRow.module.css"

interface NetworkRowProps {
  row: NetworkRowData
  /** Query key of the list this row belongs to (for optimistic follow). */
  activeKey: NetworkListKey
}

export default function NetworkRow({ row, activeKey }: NetworkRowProps) {
  const { toProfile } = useNavigation()
  const toggle = useNetworkFollow(activeKey)

  const isOrg = row.type === "organization"
  const href = toProfile(row.username, row.type)
  const initials = (row.name || row.username || "?").slice(0, 2).toUpperCase()

  const handleToggle = () => {
    toggle.mutate({ row, next: !row.is_following })
  }

  return (
    <li className={styles.row}>
      <Link href={href} className={styles.main}>
        <Avatar
          src={row.avatar || undefined}
          initials={initials}
          size="md"
          className={styles.avatar}
        />

        <span className={styles.text}>
          <span className={styles.nameLine}>
            <span className={styles.name}>{row.name || row.username}</span>
            {isOrg && row.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={15}
                height={15}
                className={styles.verified}
                aria-label="Verified organization"
              />
            )}
          </span>

          {row.headline && (
            <span className={styles.meta}>
              <span className={styles.headline}>{row.headline}</span>
            </span>
          )}
        </span>
      </Link>

      {!row.is_me && (
        <Button
          variant={row.is_following ? "outline" : "brand"}
          size="sm"
          loading={toggle.isPending}
          onClick={handleToggle}
          className={styles.followBtn}
          aria-label={
            row.is_following
              ? `Unfollow ${row.name || row.username}`
              : `Follow ${row.name || row.username}`
          }
          leftIcon={
            <Icon
              icon={row.is_following ? "mdi:check" : "mdi:plus"}
              width={14}
              height={14}
            />
          }
        >
          {row.is_following ? "Following" : "Follow"}
        </Button>
      )}
    </li>
  )
}
