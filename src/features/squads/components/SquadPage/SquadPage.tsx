"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { isAxiosError } from "axios"

import { BackHeader, Button } from "@/shared/components/ui"
import { whenHistorySettled } from "@/shared/hooks/useBackToClose"
import { useAuthStore } from "@/store/auth.store"
import { useSquad, useSquadRoster } from "../../hooks/useSquads"
import { useSquadPermissions } from "../../hooks/useSquadPermissions"
import { squadErrorCode } from "../../squadErrors"
import { publicSquadPath, squadMeta } from "../../squadUtils"
import type { Roster, SquadDetail, SquadTab } from "../../types"
import { InviteShareSheet } from "../InviteShare/InviteShare"
import InvitePlayerSheet from "../InvitePlayerSheet/InvitePlayerSheet"
import PlayersTab from "../PlayersTab/PlayersTab"
import RequestsTab from "../RequestsTab/RequestsTab"
import SettingsTab from "../SettingsTab/SettingsTab"
import SquadPhoto, { SportChip } from "../SquadPhoto/SquadPhoto"
import styles from "./SquadPage.module.css"

function squadsBase(orgId: string) {
  return `/organization/admin/${orgId}/squads`
}

function tabHref(orgId: string, squadId: string, tab: SquadTab): string {
  const base = `${squadsBase(orgId)}/${squadId}`
  return tab === "players" ? base : `${base}/${tab}`
}

function isMissing(err: unknown): boolean {
  return (
    squadErrorCode(err) === "not_found" || (isAxiosError(err) && err.response?.status === 404)
  )
}

/** "#4" when the captain wears a number, "—" otherwise (or with no captain). */
function captainLabel(squad: SquadDetail, roster: Roster | undefined): string {
  if (!squad.captain_member_id || !roster) return "—"
  for (const group of roster.groups) {
    const captain = group.members.find((member) => member.id === squad.captain_member_id)
    if (captain) return captain.jersey_number != null ? `#${captain.jersey_number}` : "—"
  }
  return "—"
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </span>
  )
}

function SquadTabs({
  orgId,
  squad,
  active,
  canReview,
  canManage,
}: {
  orgId: string
  squad: SquadDetail
  active: SquadTab
  canReview: boolean
  canManage: boolean
}) {
  const tabs: { id: SquadTab; label: string; badge?: number }[] = [
    { id: "players", label: "Players" },
    ...(canReview ? [{ id: "requests" as const, label: "Requests", badge: squad.pending_count }] : []),
    ...(canManage ? [{ id: "settings" as const, label: "Settings" }] : []),
  ]

  return (
    <nav className={styles.tabs} aria-label="Squad sections">
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            // Replace, not push: switching tabs is not somewhere back should
            // step through on its way to the list.
            href={tabHref(orgId, squad.id, tab.id)}
            replace
            scroll={false}
            className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
            {!!tab.badge && tab.badge > 0 && (
              <span className={styles.tabBadge} aria-label={`${tab.badge} waiting`}>
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * "View public page": the squad as everyone else sees it. A hidden squad has no
 * public page, so the button says so instead of opening a 404.
 */
function ViewPublicPage({
  orgUsername,
  squad,
}: {
  orgUsername: string | undefined
  squad: SquadDetail
}) {
  if (!orgUsername) return null
  if (!squad.is_public) {
    return (
      <span className={styles.viewPublicOff} title="Hidden from your profile">
        <button type="button" className={styles.shareBtn} disabled aria-label="Hidden from your profile">
          <Icon icon="mdi:eye-off-outline" width={22} height={22} />
        </button>
      </span>
    )
  }
  return (
    <Link
      href={publicSquadPath(orgUsername, squad.id)}
      className={styles.shareBtn}
      aria-label="View public page"
      title="View public page"
    >
      <Icon icon="mdi:eye-outline" width={22} height={22} />
    </Link>
  )
}

function SquadPageSkeleton() {
  return (
    <div aria-hidden="true">
      <span className={styles.skeletonBanner} />
      <span className={styles.skeletonTabs}>
        <span className={styles.skeletonTab} />
        <span className={styles.skeletonTab} />
      </span>
    </div>
  )
}

export default function SquadPage({
  orgId,
  squadId,
  tab,
}: {
  orgId: string
  squadId: string
  tab: SquadTab
}) {
  const router = useRouter()
  const permissions = useSquadPermissions(orgId)
  const { data: squad, isLoading, isError, error, refetch, isRefetching } = useSquad(
    orgId,
    squadId
  )

  // The server only sends the invite link to someone with squads.review, which
  // makes it a fresher answer than the org list in the store once the squad is
  // here. Managing has no such signal, so it comes from the store.
  const canReview = squad ? squad.invite !== null : permissions.canReview
  const canManage = permissions.canManage

  const allowed = tab === "players" || (tab === "requests" ? canReview : canManage)
  const activeTab: SquadTab = allowed ? tab : "players"

  // A tab this person may not see goes to Players — once the squad has loaded,
  // so the answer is the server's and not a store still settling.
  useEffect(() => {
    if (squad && !allowed) router.replace(tabHref(orgId, squadId, "players"), { scroll: false })
  }, [allowed, orgId, router, squad, squadId])

  // Only for the captain's number in the stats; the Players tab reads the same query.
  const { data: roster } = useSquadRoster(orgId, squadId, !!squad?.captain_member_id)

  const meta = squad ? squadMeta(squad) : ""
  const orgUsername = useAuthStore(
    (state) => state.organizations.find((organization) => organization.id === orgId)?.username
  )

  const [sharing, setSharing] = useState(false)
  const [inviting, setInviting] = useState(false)

  // The direct-invite sheet can be asked for from inside the share sheet, which
  // is closing in the same tick: it opens once history has settled, so the
  // share sheet's entry is gone first (see whenHistorySettled).
  const cancelInvite = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelInvite.current?.(), [])
  const openInviteDirect = () => {
    cancelInvite.current?.()
    cancelInvite.current = whenHistorySettled(() => {
      cancelInvite.current = null
      setInviting(true)
    })
  }

  if (isError && !squad && isMissing(error)) {
    return (
      <div className={styles.page}>
        <BackHeader title="Squad" fallback={squadsBase(orgId)} />
        <div className={styles.state}>
          <Icon icon="mdi:shield-off-outline" width={36} height={36} aria-hidden="true" />
          <p>This squad isn&apos;t available any more.</p>
          <Button variant="outline" href={squadsBase(orgId)}>
            Back to squads
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <BackHeader
          title={squad?.name ?? (isLoading ? undefined : "Squad")}
          subtitle={meta || undefined}
          fallback={squadsBase(orgId)}
        />
        {squad && <ViewPublicPage orgUsername={orgUsername} squad={squad} />}
        {squad?.invite && (
          <button
            type="button"
            className={styles.shareBtn}
            onClick={() => setSharing(true)}
            aria-label="Share invite link"
          >
            <Icon icon="mdi:share-variant-outline" width={22} height={22} />
          </button>
        )}
      </div>

      {isLoading ? (
        <SquadPageSkeleton />
      ) : !squad ? (
        <div className={styles.state}>
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
          <p>Couldn&apos;t load this squad.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <SquadPhoto
            photoUrl={squad.photo_url}
            sport={squad.sport}
            showAddHint={canManage}
            className={styles.banner}
          >
            <SportChip sport={squad.sport} />
            <div className={styles.scrim}>
              <Stat value={String(squad.members_count)} label="Players" />
              <Stat value={String(squad.staff.length)} label="Staff" />
              <Stat value={captainLabel(squad, roster)} label="Captain" />
            </div>
          </SquadPhoto>

          <SquadTabs
            orgId={orgId}
            squad={squad}
            active={activeTab}
            canReview={canReview}
            canManage={canManage}
          />

          <div className={styles.body}>
            {activeTab === "players" ? (
              <PlayersTab
                orgId={orgId}
                squad={squad}
                canReview={canReview}
                canManage={canManage}
                onInviteDirect={openInviteDirect}
              />
            ) : activeTab === "requests" ? (
              <RequestsTab orgId={orgId} squad={squad} onShareLink={() => setSharing(true)} />
            ) : (
              <SettingsTab orgId={orgId} squad={squad} />
            )}
          </div>

          {sharing && (
            <InviteShareSheet
              orgId={orgId}
              squad={squad}
              canManage={canManage}
              onClose={() => setSharing(false)}
              onInviteDirect={openInviteDirect}
            />
          )}
          {inviting && canReview && (
            <InvitePlayerSheet orgId={orgId} squad={squad} onClose={() => setInviting(false)} />
          )}
        </>
      )}
    </div>
  )
}
