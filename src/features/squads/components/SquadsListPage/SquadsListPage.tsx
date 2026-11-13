"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { BackHeader, Button } from "@/shared/components/ui"
import { useSquads } from "../../hooks/useSquads"
import { useSquadPermissions } from "../../hooks/useSquadPermissions"
import { squadErrorCode } from "../../squadErrors"
import { countLabel, squadMeta } from "../../squadUtils"
import type { SquadListItem } from "../../types"
import NewSquadSheet from "../NewSquadSheet/NewSquadSheet"
import SquadPhoto, { SportChip } from "../SquadPhoto/SquadPhoto"
import styles from "./SquadsListPage.module.css"

const SKELETON_CARDS = 4

function squadsBase(orgId: string) {
  return `/organization/admin/${orgId}/squads`
}

/** "4 squads · 65 players". */
function summaryLine(squads: SquadListItem[]): string {
  const players = squads.reduce((sum, squad) => sum + squad.members_count, 0)
  return `${countLabel(squads.length, "squad", "squads")} · ${countLabel(players, "player", "players")}`
}

/**
 * People asking to join, across every squad, for someone who can answer them.
 * It goes to the first squad with requests; that squad's page lists the rest.
 */
function WaitingBanner({ orgId, squads }: { orgId: string; squads: SquadListItem[] }) {
  const waiting = squads.filter((squad) => squad.pending_count > 0)
  if (waiting.length === 0) return null

  const total = waiting.reduce((sum, squad) => sum + squad.pending_count, 0)
  const first = waiting[0]
  const subline =
    waiting.length === 1 ? `${first.name} · from your invite link` : `Across ${waiting.length} squads`

  return (
    <Link href={`${squadsBase(orgId)}/${first.id}/requests`} className={styles.banner}>
      <span className={styles.bannerBadge} aria-hidden="true">
        {total > 99 ? "99+" : total}
      </span>
      <span className={styles.bannerText}>
        <span className={styles.bannerTitle}>
          {countLabel(total, "player", "players")} waiting to join
        </span>
        <span className={styles.bannerSub}>{subline}</span>
      </span>
      <span className={styles.bannerAction}>
        Review
        <Icon icon="mdi:chevron-right" width={18} height={18} aria-hidden="true" />
      </span>
    </Link>
  )
}

function SquadCard({
  orgId,
  squad,
  canReview,
  canManage,
}: {
  orgId: string
  squad: SquadListItem
  canReview: boolean
  canManage: boolean
}) {
  const meta = squadMeta(squad)
  const isEmpty = squad.members_count === 0

  return (
    <li>
      <Link href={`${squadsBase(orgId)}/${squad.id}`} className={styles.card}>
        <SquadPhoto
          photoUrl={squad.photo_url}
          sport={squad.sport}
          showAddHint={canManage}
          className={styles.cardPhoto}
        >
          <SportChip sport={squad.sport} />
        </SquadPhoto>

        <span className={styles.cardBody}>
          <span className={styles.cardTitleRow}>
            <span className={styles.cardTitleText}>
              <span className={styles.cardName}>{squad.name}</span>
              {meta && <span className={styles.cardMeta}>{meta}</span>}
            </span>
            <Icon
              icon="mdi:chevron-right"
              width={22}
              height={22}
              className={styles.chevron}
              aria-hidden="true"
            />
          </span>

          <span className={styles.chips}>
            <span className={styles.chip}>
              {isEmpty ? "No players yet" : countLabel(squad.members_count, "player", "players")}
            </span>
            {canReview && squad.pending_count > 0 && (
              <span className={`${styles.chip} ${styles.chipWarn}`}>
                {squad.pending_count} waiting
              </span>
            )}
            {squad.is_public ? (
              <span className={`${styles.chip} ${styles.chipBrand}`}>On profile</span>
            ) : (
              <span className={styles.chip}>
                <Icon icon="mdi:eye-off-outline" width={14} height={14} aria-hidden="true" />
                Hidden from profile
              </span>
            )}
            {!squad.invite_enabled && (
              <span className={styles.chip}>
                <Icon icon="mdi:link-variant-off" width={14} height={14} aria-hidden="true" />
                Link off
              </span>
            )}
          </span>

          {/* The whole card opens the squad page, and an empty squad's page opens
              on its share screen: this says so rather than being a second link. */}
          {isEmpty && canReview && (
            <span className={styles.shareAction}>
              <Icon icon="mdi:share-variant-outline" width={16} height={16} aria-hidden="true" />
              Share invite
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

function SkeletonCards() {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
        <li key={index} className={styles.skeletonCard}>
          <span className={styles.skeletonPhoto} />
          <span className={styles.skeletonBody}>
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLineShort} />
            <span className={styles.skeletonChips}>
              <span className={styles.skeletonChip} />
              <span className={styles.skeletonChip} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function SquadsListPage({ orgId }: { orgId: string }) {
  const { canReview, canManage } = useSquadPermissions(orgId)
  const { data, isLoading, isError, error, refetch, isRefetching } = useSquads(orgId)
  const [creating, setCreating] = useState(false)

  const squads = useMemo(() => data ?? [], [data])
  const hasSquads = squads.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <BackHeader title="Squads" fallback={`/organization/admin/${orgId}/dashboard`} />
        {canManage && hasSquads && (
          <Button
            variant="brand"
            size="sm"
            leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}
            onClick={() => setCreating(true)}
          >
            New
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonCards />
      ) : isError && !data ? (
        squadErrorCode(error) === "forbidden" ? (
          <div className={styles.state}>
            <Icon icon="mdi:lock-outline" width={36} height={36} aria-hidden="true" />
            <p>You don&apos;t have access to this club&apos;s squads.</p>
          </div>
        ) : (
          <div className={styles.state}>
            <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
            <p>Couldn&apos;t load squads.</p>
            <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )
      ) : !hasSquads ? (
        canManage ? (
          <div className={styles.state}>
            <Icon icon="mdi:shield-account-outline" width={40} height={40} aria-hidden="true" />
            <p className={styles.stateTitle}>Create your first squad</p>
            <Button
              variant="brand"
              leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}
              onClick={() => setCreating(true)}
            >
              New squad
            </Button>
          </div>
        ) : (
          <p className={styles.quiet}>No squads yet.</p>
        )
      ) : (
        <>
          <p className={styles.summary}>{summaryLine(squads)}</p>

          {canReview && <WaitingBanner orgId={orgId} squads={squads} />}

          <ul className={styles.grid}>
            {squads.map((squad) => (
              <SquadCard
                key={squad.id}
                orgId={orgId}
                squad={squad}
                canReview={canReview}
                canManage={canManage}
              />
            ))}
          </ul>
        </>
      )}

      {creating && <NewSquadSheet orgId={orgId} onClose={() => setCreating(false)} />}
    </div>
  )
}
