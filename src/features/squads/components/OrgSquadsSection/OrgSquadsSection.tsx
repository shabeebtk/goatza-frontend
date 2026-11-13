"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { ORG_PERMISSIONS, hasOrgPermission } from "@/shared/permissions/orgPermissions"
import { useAuthStore } from "@/store/auth.store"
import { usePublicSquadShowcase, useSquadShowcase } from "../../hooks/useSquadShowcase"
import { countLabel, publicSquadsPath } from "../../squadUtils"
import ShowcaseSquadCard from "../ShowcaseSquadCard/ShowcaseSquadCard"
import styles from "./OrgSquadsSection.module.css"

const PREVIEW = 3

/**
 * "Squads" on a club's profile, before Posts: up to three of the squads the club
 * shows publicly, and "See all squads" when there are more. Nothing at all —
 * not even the divider — when the club shows none (or the answer is the 404).
 *
 * `anonymous` is the public route's logged-out view, which reads the public
 * endpoint; everyone else reads the signed-in showcase, which applies the same
 * rules to the club's own members.
 */
export default function OrgSquadsSection({
  orgId,
  username,
  anonymous,
}: {
  orgId: string
  username: string
  anonymous: boolean
}) {
  const signedIn = useSquadShowcase(username, !anonymous)
  const loggedOut = usePublicSquadShowcase(username, anonymous)
  const data = anonymous ? loggedOut.data : signedIn.data

  // A member who may see the club's squads (squads.view) gets the way in to
  // manage them. A permission, never a role.
  const canManageHere = useAuthStore((state) =>
    hasOrgPermission(
      state.organizations.find((organization) => organization.id === orgId),
      ORG_PERMISSIONS.SQUADS_VIEW
    )
  )

  const squads = data?.squads ?? []
  if (squads.length === 0) return null

  return (
    <>
      <div className={styles.divider} />
      <section className={styles.section} aria-labelledby={`squads-${orgId}`}>
        <div className={styles.head}>
          <h2 id={`squads-${orgId}`} className={styles.title}>
            Squads
          </h2>
          <span className={styles.count}>{countLabel(squads.length, "squad", "squads")}</span>
          {canManageHere && !anonymous && (
            <Link href={`/organization/admin/${orgId}/squads`} className={styles.manage}>
              <Icon icon="mdi:cog-outline" width={14} height={14} aria-hidden="true" />
              Manage squads
            </Link>
          )}
        </div>

        <div className={styles.list}>
          {squads.slice(0, PREVIEW).map((squad) => (
            <ShowcaseSquadCard key={squad.id} orgUsername={username} squad={squad} />
          ))}
        </div>

        {squads.length > PREVIEW && (
          <Link href={publicSquadsPath(username)} className={styles.seeAll}>
            See all squads
            <Icon icon="mdi:arrow-right" width={16} height={16} aria-hidden="true" />
          </Link>
        )}
      </section>
    </>
  )
}
