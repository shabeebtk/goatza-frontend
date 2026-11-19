"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { MAX_FEATURED_PLAYERS, usePlayers, useRemovePlayer, useReorderPlayers } from "../../hooks/usePeople"
import { moveId } from "../../hooks/reorder"
import { pageErrorSentence } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import type { FeaturedPlayer } from "../../types"
import ActionsSheet from "../ActionsSheet/ActionsSheet"
import AddPlayersSheet from "./AddPlayersSheet"
import HighlightSheet from "./HighlightSheet"
import { initialsOf } from "./coachFields"
import { cantShowReason, playerLine } from "./playerFormat"
import styles from "./PeoplePage.module.css"

type Open =
  | { kind: "menu"; player: FeaturedPlayer; index: number }
  | { kind: "highlight"; player: FeaturedPlayer }
  | { kind: "add" }
  | null

/**
 * "Players we developed": OPT-IN. Only the players the club picks appear, from
 * those whose time here it verified, and only public profiles can be shown.
 */
export default function PlayersTab({ orgId, noun }: { orgId: string; noun: string }) {
  const toast = useToast()
  const { data, isLoading, isError, refetch, isRefetching } = usePlayers(orgId)
  const reorder = useReorderPlayers(orgId)
  const remove = useRemovePlayer(orgId)
  const [open, setOpen] = useState<Open>(null)
  const [removing, setRemoving] = useState<FeaturedPlayer | null>(null)

  const players = data?.players ?? []
  const candidates = data?.candidates ?? []
  const full = players.length >= MAX_FEATURED_PLAYERS
  const nobodyToPick = players.length === 0 && candidates.length === 0

  const move = (player: FeaturedPlayer, delta: -1 | 1) => {
    const ids = moveId(
      players.map((item) => item.id),
      player.id,
      delta
    )
    if (ids) reorder.mutate(ids)
  }

  if (isLoading) {
    return (
      <div className={styles.skeleton} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span key={index} style={{ height: 72 }} />
        ))}
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className={styles.state} role="alert">
        <p>Couldn&apos;t load your players.</p>
        <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.tab}>
      <p className={styles.intro}>
        Players whose time at your {noun} you verified. Pick the ones to show. Only players with a
        public profile can be shown.
      </p>

      {nobodyToPick ? (
        <div className={styles.empty}>
          <p>Verify a player&apos;s time at your {noun} on Verify, then pick them here.</p>
          <Button variant="outline" href={`${orgAdminBase(orgId)}/verifications`}>
            Go to Verify
          </Button>
        </div>
      ) : (
        <>
          {players.length === 0 ? (
            <p className={styles.quiet}>Nobody picked yet.</p>
          ) : (
            <ul className={styles.rows}>
              {players.map((player, index) => (
                <li key={player.id} className={`${styles.row} ${player.can_feature ? "" : styles.rowHidden}`}>
                  <span className={styles.rowMain}>
                    <Avatar
                      src={player.user.photo || undefined}
                      initials={initialsOf(player.user.name)}
                      size="md"
                    />
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{player.user.name}</span>
                      {playerLine(player) && <span className={styles.rowLine}>{playerLine(player)}</span>}
                      {player.highlight && <span className={styles.highlight}>{player.highlight}</span>}
                      {!player.can_feature && (
                        <span className={styles.hiddenTag}>Not shown: {cantShowReason(player)?.toLowerCase()}</span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.moreButton}
                    aria-label={`More for ${player.user.name}`}
                    onClick={() => setOpen({ kind: "menu", player, index })}
                  >
                    <Icon icon="mdi:dots-horizontal" width={22} height={22} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {full ? (
            <p className={styles.hint}>You can show up to {MAX_FEATURED_PLAYERS} players.</p>
          ) : (
            <div className={styles.addRow}>
              <Button
                variant="outline"
                leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}
                onClick={() => setOpen({ kind: "add" })}
              >
                Add players
              </Button>
            </div>
          )}
        </>
      )}

      {open?.kind === "menu" && (
        <ActionsSheet
          title={open.player.user.name}
          onClose={() => setOpen(null)}
          actions={[
            {
              id: "highlight",
              label: open.player.highlight ? "Edit highlight" : "Add a highlight",
              icon: "mdi:star-outline",
              onSelect: () => setOpen({ kind: "highlight", player: open.player }),
            },
            {
              id: "up",
              label: "Move up",
              icon: "mdi:arrow-up",
              disabled: open.index === 0 || reorder.isPending,
              onSelect: () => move(open.player, -1),
            },
            {
              id: "down",
              label: "Move down",
              icon: "mdi:arrow-down",
              disabled: open.index === players.length - 1 || reorder.isPending,
              onSelect: () => move(open.player, 1),
            },
            {
              id: "remove",
              label: "Remove from page",
              icon: "mdi:account-remove-outline",
              tone: "danger",
              onSelect: () => setRemoving(open.player),
            },
          ]}
        />
      )}

      {open?.kind === "highlight" && (
        <HighlightSheet orgId={orgId} player={open.player} onClose={() => setOpen(null)} />
      )}

      {open?.kind === "add" && <AddPlayersSheet orgId={orgId} noun={noun} onClose={() => setOpen(null)} />}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.user.name ?? "this player"} from your page?`}
        message="Their career entry stays verified."
        confirmLabel="Remove"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => {
          const player = removing
          setRemoving(null)
          if (!player) return
          remove.mutate(player.id, {
            onSuccess: () =>
              toast.show({ title: "Removed from your page", variant: "success", position: "top-center" }),
            onError: (err) =>
              toast.show({
                title: "Couldn't remove them",
                message: pageErrorSentence(err),
                variant: "error",
                position: "top-center",
              }),
          })
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
