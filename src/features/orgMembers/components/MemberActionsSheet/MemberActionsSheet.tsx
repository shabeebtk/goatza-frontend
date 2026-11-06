"use client"

import { useState } from "react"

import type { OrgMemberRole } from "@/features/organization/types"
import { Button, Select } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useChangeMemberRole, useRemoveMember } from "../../hooks/useOrgMembers"
import { orgMemberErrorSentence } from "../../orgMemberErrors"
import type { OrgMember } from "../../services/orgMembers.api"
import MembersSheet from "../MembersSheet/MembersSheet"
import styles from "./MemberActionsSheet.module.css"

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "coach", label: "Coach" },
  { value: "staff", label: "Staff" },
]

/** The ⋯ on someone's row: change their role, or remove them. */
export default function MemberActionsSheet({
  orgId,
  orgName,
  member,
  onClose,
}: {
  orgId: string
  orgName: string
  member: OrgMember
  onClose: () => void
}) {
  const toast = useToast()
  const changeRole = useChangeMemberRole(orgId)
  const remove = useRemoveMember(orgId)

  const [askingRemove, setAskingRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = member.user.name

  const onRoleChange = (value: string) => {
    setError(null)
    changeRole.mutate(
      { memberId: member.id, role: value as OrgMemberRole },
      {
        onSuccess: () => {
          toast.show({ title: "Role updated", variant: "success", position: "top-center" })
        },
        onError: (err) => setError(orgMemberErrorSentence(err, orgName)),
      }
    )
  }

  return (
    <MembersSheet title={name} onClose={onClose}>
      {(close) => (
        <div className={styles.content}>
          <Select
            label="Role"
            sheetTitle="Role"
            options={ROLE_OPTIONS}
            value={member.role}
            disabled={changeRole.isPending}
            onChange={onRoleChange}
          />

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <Button
            variant="danger"
            fullWidth
            loading={remove.isPending}
            onClick={() => setAskingRemove(true)}
          >
            Remove from {orgName}
          </Button>

          <ConfirmDialog
            open={askingRemove}
            title={`Remove ${name}?`}
            message={`They'll lose access to ${orgName} right away.`}
            confirmLabel="Remove"
            cancelLabel="Cancel"
            tone="danger"
            onCancel={() => setAskingRemove(false)}
            onConfirm={() => {
              setAskingRemove(false)
              setError(null)
              remove.mutate(member.id, {
                onSuccess: () => {
                  toast.show({
                    title: `${name} removed`,
                    variant: "success",
                    position: "top-center",
                  })
                  close()
                },
                onError: (err) => setError(orgMemberErrorSentence(err, orgName)),
              })
            }}
          />
        </div>
      )}
    </MembersSheet>
  )
}
