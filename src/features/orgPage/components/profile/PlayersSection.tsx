"use client"

import { useId, useState } from "react"
import Link from "next/link"

import { useNavigation } from "@/shared/services/navigation.service"
import { orgNoun } from "../../format"
import { playerLine, playerNote } from "../../profileSections"
import type { ShowcasePlayer } from "../../types"
import PageAvatar from "./PageAvatar"
import ProfileSection, { ShowAllButton } from "./ProfileSection"
import styles from "./PlayersSection.module.css"

/** Rows shown before "See all". */
const PREVIEW = 3

/**
 * Players we developed: the ones the club picked, from those whose time there
 * it verified. Each links to the player's profile (a name without one is text).
 */
export default function PlayersSection({
  players,
  orgType,
}: {
  players: ShowcasePlayer[]
  orgType: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { toProfile } = useNavigation()
  const listId = useId()

  if (players.length === 0) return null
  const shown = expanded ? players : players.slice(0, PREVIEW)

  return (
    <ProfileSection
      sectionKey="players"
      title="Players we developed"
      subtitle={`Their time here is verified by the ${orgNoun(orgType)}.`}
    >
      <ul id={listId} className={styles.list}>
        {shown.map((player) => {
          const line = playerLine(player)
          const note = playerNote(player)
          return (
            <li key={player.username || player.name} className={styles.row}>
              <PageAvatar src={player.photo} name={player.name} size="md" />
              <div className={styles.text}>
                {player.username ? (
                  <Link href={toProfile(player.username)} className={styles.name}>
                    {player.name}
                  </Link>
                ) : (
                  <span className={styles.name}>{player.name}</span>
                )}
                {line && <span className={styles.line}>{line}</span>}
                {note && <span className={styles.note}>{note}</span>}
              </div>
            </li>
          )
        })}
      </ul>

      {players.length > PREVIEW && (
        <ShowAllButton
          expanded={expanded}
          total={players.length}
          noun="players"
          controls={listId}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </ProfileSection>
  )
}
