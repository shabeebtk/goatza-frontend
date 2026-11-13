"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { countLabel, initialsOf, publicSquadPath, showcaseMeta } from "../../squadUtils"
import type { ShowcasePreviewMember, ShowcaseSquadCard as Card } from "../../types"
import styles from "./ShowcaseSquadCard.module.css"

const FACES = 5

/** A round photo, or initials when there is none (a minor, on the anonymous route). */
export function ShowcaseAvatar({
  name,
  photo,
  size,
  className,
}: {
  name: string
  photo: string
  size: number
  className?: string
}) {
  return (
    <span
      className={`${styles.avatar} ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className={styles.avatarImg} loading="lazy" decoding="async" />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}

function FacePile({ members }: { members: ShowcasePreviewMember[] }) {
  if (members.length === 0) return null
  return (
    <span className={styles.faces} aria-hidden="true">
      {members.slice(0, FACES).map((member, index) => (
        <ShowcaseAvatar
          key={`${member.name}-${index}`}
          name={member.name}
          photo={member.photo}
          size={28}
          className={styles.face}
        />
      ))}
    </span>
  )
}

/**
 * One squad on a club's profile and on its squads page, linking to the squad's
 * page. With a photo: the 16:9 band with the name over a scrim. Without one: the
 * compact row (an icon tile, the name and the count), which reads better than a
 * large empty placeholder.
 */
export default function ShowcaseSquadCard({
  orgUsername,
  squad,
}: {
  orgUsername: string
  squad: Card
}) {
  const href = publicSquadPath(orgUsername, squad.id)
  const meta = showcaseMeta(squad)
  const players = countLabel(squad.members_count, "player", "players")

  if (!squad.photo_url) {
    return (
      <Link href={href} className={styles.row}>
        <span className={styles.rowTile} aria-hidden="true">
          <Icon icon={squad.sport.icon_name || "mdi:shield-account-outline"} width={30} height={30} />
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowName}>{squad.name}</span>
          <span className={styles.rowMeta}>
            {[squad.sport.name, squad.level_label].filter(Boolean).join(" · ")}
            {" · "}
            {players}
          </span>
          {squad.head_coach_name && (
            <span className={styles.rowCoach}>Coach {squad.head_coach_name}</span>
          )}
        </span>
        <FacePile members={squad.preview_members} />
        <Icon icon="mdi:chevron-right" width={20} height={20} className={styles.chevron} aria-hidden="true" />
      </Link>
    )
  }

  return (
    <Link href={href} className={styles.card}>
      <span className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={squad.photo_url} alt="" className={styles.photoImg} loading="lazy" decoding="async" />
        <span className={styles.scrim} aria-hidden="true" />
        <span className={styles.overlay}>
          <span className={styles.name}>{squad.name}</span>
          {meta && <span className={styles.meta}>{meta}</span>}
        </span>
      </span>
      <span className={styles.foot}>
        <FacePile members={squad.preview_members} />
        <span className={styles.count}>{players}</span>
        {squad.head_coach_name && (
          <span className={styles.coach}>Coach {squad.head_coach_name}</span>
        )}
      </span>
    </Link>
  )
}
