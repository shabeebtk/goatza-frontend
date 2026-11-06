"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"

import { Avatar, BackHeader, Button } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  ORG_PERMISSIONS,
  hasOrgPermission,
  orgRoleLabel,
} from "@/shared/permissions/orgPermissions"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import {
  useCancelInvite,
  useLeaveOrganization,
  useOrgMembers,
  usePendingInvites,
} from "../../hooks/useOrgMembers"
import { orgMemberErrorSentence } from "../../orgMemberErrors"
import type { OrgMember, PendingInvite } from "../../services/orgMembers.api"
import AddMemberSheet from "../AddMemberSheet/AddMemberSheet"
import MemberActionsSheet from "../MemberActionsSheet/MemberActionsSheet"
import styles from "./OrgMembersPage.module.css"

const SKELETON_ROWS = 4

function expiresIn(expiresAt: string): string {
  const days = Math.max(dayjs(expiresAt).diff(dayjs(), "day"), 0)
  if (days === 0) return "expires today"
  return days === 1 ? "expires in 1 day" : `expires in ${days} days`
}

function RoleChip({ role }: { role: string }) {
  return <span className={styles.roleChip}>{orgRoleLabel(role)}</span>
}

function MemberRow({
  member,
  canManage,
  onActions,
}: {
  member: OrgMember
  canManage: boolean
  onActions: (member: OrgMember) => void
}) {
  const { toProfile } = useNavigation()
  const { user } = member

  return (
    <li className={styles.row}>
      <Link href={toProfile(user.username)} className={styles.person}>
        <Avatar
          src={user.profile_photo}
          initials={user.name?.slice(0, 2).toUpperCase() || "?"}
          size="md"
        />
        <span className={styles.personText}>
          <span className={styles.name}>
            {user.name}
            {member.is_me && <span className={styles.youTag}>You</span>}
          </span>
          <span className={styles.handle}>@{user.username}</span>
          <span className={styles.meta}>
            <RoleChip role={member.role} />
            <span>Joined {dayjs(member.joined_at).format("MMM YYYY")}</span>
          </span>
        </span>
      </Link>

      {canManage && !member.is_me && (
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => onActions(member)}
          aria-label={`Actions for ${user.name}`}
        >
          <Icon icon="mdi:dots-horizontal" width={20} height={20} />
        </button>
      )}
    </li>
  )
}

function InviteRow({
  invite,
  onCancel,
}: {
  invite: PendingInvite
  onCancel: (invite: PendingInvite) => void
}) {
  const person = invite.invited_user
  const title = person?.name ?? invite.email_masked ?? "Invited"
  const invitedBy = invite.invited_by?.name

  return (
    <li className={styles.row}>
      <span className={styles.person}>
        {person ? (
          <Avatar
            src={person.profile_photo}
            initials={person.name?.slice(0, 2).toUpperCase() || "?"}
            size="md"
          />
        ) : (
          <span className={styles.mailIcon} aria-hidden="true">
            <Icon icon="mdi:email-outline" width={20} height={20} />
          </span>
        )}
        <span className={styles.personText}>
          <span className={styles.name}>{title}</span>
          <span className={styles.meta}>
            <RoleChip role={invite.role} />
          </span>
          <span className={styles.handle}>
            {invitedBy ? `Invited by ${invitedBy} · ` : ""}
            {expiresIn(invite.expires_at)}
          </span>
        </span>
      </span>
      <Button size="sm" variant="ghost" onClick={() => onCancel(invite)}>
        Cancel
      </Button>
    </li>
  )
}

function SkeletonRows() {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <li key={index} className={styles.skeletonRow}>
          <span className={styles.skeletonAvatar} />
          <span className={styles.skeletonLines}>
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLineShort} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function OrgMembersPage({ orgId }: { orgId: string }) {
  const base = `/organization/admin/${orgId}`
  const toast = useToast()

  const orgName =
    useAuthStore(
      (state) => state.organizations.find((organization) => organization.id === orgId)?.name
    ) ?? "this organization"

  const { data, isLoading, isError, refetch } = useOrgMembers(orgId)

  // The server's answer for this screen: fresher than the org list in the store.
  const canManage = hasOrgPermission(
    { my_permissions: data?.me.permissions },
    ORG_PERMISSIONS.MEMBERS_MANAGE
  )

  const { data: invites } = usePendingInvites(orgId, canManage)
  const cancelInvite = useCancelInvite(orgId)
  const leave = useLeaveOrganization(orgId, orgName)

  const [adding, setAdding] = useState(false)
  const [actionsFor, setActionsFor] = useState<OrgMember | null>(null)
  const [cancelling, setCancelling] = useState<PendingInvite | null>(null)
  const [askingLeave, setAskingLeave] = useState(false)

  const members = useMemo(() => data?.members ?? [], [data])
  const pending = useMemo(() => invites ?? [], [invites])

  const memberUserIds = useMemo(
    () => new Set(members.map((member) => member.user.id)),
    [members]
  )
  const invitedUserIds = useMemo(
    () => new Set(pending.flatMap((invite) => (invite.invited_user ? [invite.invited_user.id] : []))),
    [pending]
  )

  // Ownership itself, not a permission: the same question the server's last-owner
  // rule asks, and the one place on the client a role decides something.
  const isLastOwner =
    data?.me.role === "owner" && members.filter((member) => member.role === "owner").length === 1

  // Kept live from the list, so the sheet shows a role change as it lands.
  const openMember = actionsFor && members.find((member) => member.id === actionsFor.id)

  // Only the owner so far: the empty state below offers the same button.
  const isAlone = canManage && members.length === 1 && pending.length === 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <BackHeader
          title="Members"
          subtitle={data ? String(members.length) : undefined}
          fallback={`${base}/settings`}
        />
        {canManage && !isAlone && (
          <Button
            variant="brand"
            className={styles.addBtn}
            leftIcon={<Icon icon="mdi:account-plus-outline" width={18} height={18} />}
            onClick={() => setAdding(true)}
          >
            Add member
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : isError || !data ? (
        <div className={styles.state}>
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} />
          <p>Couldn&apos;t load members.</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {isAlone ? (
            <div className={styles.state}>
              <Icon icon="mdi:account-group-outline" width={36} height={36} />
              <p>Invite your coaches and staff to help run {orgName}.</p>
              <Button variant="brand" onClick={() => setAdding(true)}>
                Add member
              </Button>
            </div>
          ) : null}

          <ul className={styles.list}>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                canManage={canManage}
                onActions={setActionsFor}
              />
            ))}
          </ul>

          {canManage && pending.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Pending invites</h2>
              <ul className={styles.list}>
                {pending.map((invite) => (
                  <InviteRow key={invite.id} invite={invite} onCancel={setCancelling} />
                ))}
              </ul>
            </section>
          )}

          <div className={styles.leave}>
            <Button
              variant="ghost"
              disabled={isLastOwner || leave.isPending}
              loading={leave.isPending}
              onClick={() => setAskingLeave(true)}
            >
              Leave organization
            </Button>
            {isLastOwner && (
              <p className={styles.leaveHint}>Make someone else an owner first.</p>
            )}
          </div>
        </>
      )}

      {adding && (
        <AddMemberSheet
          orgId={orgId}
          orgName={orgName}
          memberUserIds={memberUserIds}
          invitedUserIds={invitedUserIds}
          onClose={() => setAdding(false)}
        />
      )}

      {openMember && (
        <MemberActionsSheet
          orgId={orgId}
          orgName={orgName}
          member={openMember}
          onClose={() => setActionsFor(null)}
        />
      )}

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel this invite?"
        message={`${
          cancelling?.invited_user?.name ?? cancelling?.email_masked ?? "They"
        } won't be able to join with it.`}
        confirmLabel="Cancel invite"
        cancelLabel="Keep"
        tone="danger"
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (cancelling) {
            cancelInvite.mutate(cancelling.id, {
              onError: (err) =>
                toast.show({
                  title: orgMemberErrorSentence(err, orgName),
                  variant: "error",
                  position: "top-center",
                }),
            })
          }
          setCancelling(null)
        }}
      />

      <ConfirmDialog
        open={askingLeave}
        title={`Leave ${orgName}?`}
        message="You'll lose access right away. An owner can invite you back."
        confirmLabel="Leave"
        cancelLabel="Stay"
        tone="danger"
        onCancel={() => setAskingLeave(false)}
        onConfirm={() => {
          setAskingLeave(false)
          leave.mutate(undefined, {
            onError: (err) =>
              toast.show({
                title: orgMemberErrorSentence(err, orgName),
                variant: "error",
                position: "top-center",
              }),
          })
        }}
      />
    </div>
  )
}
