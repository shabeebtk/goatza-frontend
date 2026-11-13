"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import { qrShape } from "@/features/profile/utils/shareCard/qr"
import { Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { navigateAwayFromOverlays } from "@/shared/hooks/useBackToClose"
import { useOrgName } from "../../hooks/useSquadPermissions"
import { useSquadInviteShare } from "../../hooks/useSquadInviteShare"
import { saveBlob, squadQrPng } from "../../services/squadQr"
import { fileSlug } from "../../squadUtils"
import type { SquadDetail, SquadInviteLink } from "../../types"
import SquadSheet from "../SquadSheet/SquadSheet"
import styles from "./InviteShare.module.css"

type InviteShareProps = {
  orgId: string
  squad: SquadDetail
  /** squads.manage: the "link is off" state points to Settings. */
  canManage: boolean
  /** "Invite a player directly". */
  onInviteDirect: () => void
}

function LinkCard({
  orgId,
  squad,
  invite,
}: {
  orgId: string
  squad: SquadDetail
  invite: SquadInviteLink
}) {
  const orgName = useOrgName(orgId)
  const { copyLink, shareLink } = useSquadInviteShare({
    url: invite.url,
    squadName: squad.name,
    orgName,
  })

  return (
    <section className={styles.linkCard} aria-labelledby={`fill-${squad.id}`}>
      <h3 id={`fill-${squad.id}`} className={styles.fillTitle}>
        Fill your squad
      </h3>
      <p className={styles.fillText}>
        Share this link in your squad&apos;s WhatsApp group. Players tap it, ask to join, and you
        approve them.
      </p>

      <div className={styles.linkBox}>
        <span className={styles.linkText}>{invite.url}</span>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={() => void copyLink()}
          aria-label="Copy invite link"
        >
          <Icon icon="mdi:content-copy" width={16} height={16} aria-hidden="true" />
          Copy
        </button>
      </div>

      <Button
        variant="brand"
        fullWidth
        leftIcon={<Icon icon="mdi:share-variant" width={18} height={18} />}
        onClick={() => void shareLink()}
      >
        Share link
      </Button>
    </section>
  )
}

function QrCard({ squad, invite }: { squad: SquadDetail; invite: SquadInviteLink }) {
  const toast = useToast()
  const qr = useMemo(() => qrShape(invite.url), [invite.url])
  const [saving, setSaving] = useState(false)

  const download = async () => {
    if (saving) return
    setSaving(true)
    try {
      const blob = await squadQrPng(invite.url)
      saveBlob(blob, `${fileSlug(squad.name) || "squad"}-invite-qr.png`)
    } catch (err) {
      toast.show({
        title: err instanceof Error ? err.message : "Couldn't make the QR image.",
        variant: "error",
        position: "top-center",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.qrCard} aria-label="QR code">
      {/* White in both themes, like CVQrSheet: a dark-mode inversion is a
          different symbol to a scanner. The margin is layout (see qr.ts). */}
      <div className={styles.qrPanel}>
        <svg
          className={styles.qr}
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          role="img"
          aria-label={`QR code for ${squad.name}'s invite link`}
          shapeRendering="crispEdges"
        >
          <path d={qr.d} className={styles.qrPath} />
        </svg>
      </div>
      <div className={styles.qrText}>
        <p className={styles.qrTitle}>QR code</p>
        <p className={styles.qrSub}>Print it for the notice board or show it at training.</p>
        <Button
          variant="outline"
          size="sm"
          loading={saving}
          leftIcon={<Icon icon="mdi:download" width={16} height={16} />}
          onClick={() => void download()}
        >
          Download
        </Button>
      </div>
    </section>
  )
}

/**
 * Everything a club needs to fill a squad: the invite link (copy, share), its QR
 * code, and the way to invite one player directly. The empty Players tab shows it
 * in place; the share button in the page header shows it in a sheet. Not rendered
 * for someone without squads.review (the server sends no link to them).
 */
export function InviteShareContent({ orgId, squad, canManage, onInviteDirect }: InviteShareProps) {
  const router = useRouter()
  const invite = squad.invite
  if (!invite) return null

  const settingsHref = `/organization/admin/${orgId}/squads/${squad.id}/settings`

  return (
    <div className={styles.content}>
      {invite.enabled ? (
        <>
          <LinkCard orgId={orgId} squad={squad} invite={invite} />
          <QrCard squad={squad} invite={invite} />
        </>
      ) : (
        <div className={styles.linkOff}>
          <Icon icon="mdi:link-variant-off" width={22} height={22} aria-hidden="true" />
          <p className={styles.linkOffText}>Your invite link is off.</p>
          {canManage && (
            <button
              type="button"
              className={styles.linkOffAction}
              // A tab of this page: replace, as the tabs do, and close any sheet
              // this is shown in on the way.
              onClick={() =>
                navigateAwayFromOverlays(settingsHref, {
                  push: (href) => router.replace(href, { scroll: false }),
                })
              }
            >
              Turn it on in Settings
            </button>
          )}
        </div>
      )}

      <div className={styles.or} aria-hidden="true">
        <span>or</span>
      </div>

      <button type="button" className={styles.direct} onClick={onInviteDirect}>
        <span className={styles.directIcon} aria-hidden="true">
          <Icon icon="mdi:account-search-outline" width={22} height={22} />
        </span>
        <span className={styles.directText}>
          <span className={styles.directTitle}>Invite a player directly</span>
          <span className={styles.directSub}>Search Goatza. They join as soon as they accept.</span>
        </span>
        <Icon icon="mdi:chevron-right" width={20} height={20} aria-hidden="true" />
      </button>
    </div>
  )
}

/** The empty squad's share card, in the page. */
export default function InviteShareCard(props: InviteShareProps) {
  return <InviteShareContent {...props} />
}

/** The same content in a sheet, from the page header's share button. */
export function InviteShareSheet({
  onClose,
  onInviteDirect,
  ...props
}: InviteShareProps & { onClose: () => void }) {
  return (
    <SquadSheet title="Invite players" onClose={onClose}>
      {(close) => (
        <InviteShareContent
          {...props}
          onInviteDirect={() => {
            // Close this sheet first; the page opens the next one once history
            // has settled (whenHistorySettled), so no dead entry is left behind.
            close()
            onInviteDirect()
          }}
        />
      )}
    </SquadSheet>
  )
}
