"use client"

import Link from "next/link"

import { useNavigation } from "@/shared/services/navigation.service"
import { countLabel, yearsLabel } from "../../format"
import type { ShowcaseCoach } from "../../types"
import PageAvatar from "./PageAvatar"
import ProfileSection from "./ProfileSection"
import styles from "./CoachesSection.module.css"

/**
 * Coaches: a sideways row of cards on a phone (the next one peeks), three across
 * from 768px. A coach on Goatza links to their profile; one who isn't is a name.
 */
export default function CoachesSection({ coaches }: { coaches: ShowcaseCoach[] }) {
  const { toProfile } = useNavigation()
  if (coaches.length === 0) return null

  return (
    <ProfileSection sectionKey="coaches" title="Coaches" meta={countLabel(coaches.length, "coach", "coaches")}>
      {/* Focusable, so the row can be scrolled from the keyboard on a phone. */}
      <ul className={styles.row} tabIndex={0} aria-label="Coaches">
        {coaches.map((coach) => {
          const detail = [coach.licence, yearsLabel(coach.years_coaching)].filter(Boolean).join(" · ")
          return (
            <li key={coach.id} className={styles.card}>
              <PageAvatar src={coach.photo} name={coach.name} size="lg" className={styles.avatar} />
              <div className={styles.text}>
                {coach.username ? (
                  <Link href={toProfile(coach.username)} className={`${styles.name} ${styles.nameLink}`}>
                    {coach.name}
                  </Link>
                ) : (
                  <span className={styles.name}>{coach.name}</span>
                )}
                {coach.role_label && <span className={styles.role}>{coach.role_label}</span>}
                {detail && <span className={styles.detail}>{detail}</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </ProfileSection>
  )
}
