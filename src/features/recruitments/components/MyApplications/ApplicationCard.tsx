"use client"

import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import StatusBadge from "../StatusBadge/StatusBadge"
import type { MyApplicationListItem } from "../../services/recruitments.api"
import { RECRUITMENT_TYPE_OPTIONS } from "../../filterOptions"
import styles from "./ApplicationCard.module.css"

function fmtDate(iso: string) {
  return dayjs(iso).format("DD MMM YYYY")
}

interface ApplicationCardProps {
  application: MyApplicationListItem
}

export default function ApplicationCard({ application }: ApplicationCardProps) {
  const { toRecruitment, toProfile } = useNavigation()
  const r = application.recruitment

  const typeLabel =
    RECRUITMENT_TYPE_OPTIONS.find((o) => o.value === r.recruitment_type)?.label ??
    r.recruitment_type

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <Link
          href={toProfile(r.organization.username, "organization")}
          className={styles.orgLink}
        >
          <Avatar
            src={r.organization.logo}
            initials={r.organization.name?.slice(0, 2).toUpperCase()}
            size="sm"
          />
          <span className={styles.orgName}>
            {r.organization.name}
            {r.organization.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={13}
                height={13}
                className={styles.verified}
              />
            )}
          </span>
        </Link>

        <StatusBadge status={application.status} />
      </div>

      <Link href={toRecruitment(r.id)} className={styles.titleLink}>
        <h3 className={styles.title}>{r.title}</h3>
      </Link>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <Icon
            icon={r.sport.icon_name || "mdi:trophy-outline"}
            width={14}
            height={14}
          />
          {r.sport.name}
        </span>
        <span className={styles.metaItem}>{typeLabel}</span>
        {r.city && (
          <span className={styles.metaItem}>
            <Icon icon="mdi:map-marker-outline" width={14} height={14} />
            {r.city}
          </span>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.applied}>
          <Icon icon="mdi:calendar-check-outline" width={13} height={13} />
          Applied {fmtDate(application.applied_at)}
        </span>
        <Link href={toRecruitment(r.id)} className={styles.viewBtn}>
          View
          <Icon icon="mdi:arrow-right" width={14} height={14} />
        </Link>
      </div>
    </article>
  )
}
