"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { orgRoleLabel } from "@/shared/permissions/orgPermissions"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useCreateCoach } from "../../hooks/usePeople"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import type { CoachCandidate } from "../../types"
import PageSheet from "../PageSheet/PageSheet"
import {
  CoachDetailsFields,
  coachDetailsErrors,
  coachDetailsPayload,
  emptyCoachDetails,
  initialsOf,
  type CoachDetails,
} from "./coachFields"
import styles from "./PeoplePage.module.css"

/**
 * Add one of the page's own members as a coach: pick them, then their role and
 * details. Their name and photo come from their profile.
 */
export default function AddMemberCoachSheet({
  orgId,
  candidates,
  onClose,
}: {
  orgId: string
  candidates: CoachCandidate[]
  onClose: () => void
}) {
  const ids = useId()
  const toast = useToast()
  const create = useCreateCoach(orgId)
  const [picked, setPicked] = useState<CoachCandidate | null>(null)
  const [details, setDetails] = useState<CoachDetails>(emptyCoachDetails)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (close: () => void) => {
    if (!picked || create.isPending) return
    const local = coachDetailsErrors(details)
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    create.mutate(
      { member_id: picked.member_id, ...coachDetailsPayload(details) },
      {
        onSuccess: () => {
          toast.show({ title: `${picked.name} added`, variant: "success", position: "top-center" })
          void settleViewport()
          close()
        },
        onError: (err) => {
          const fieldErrors = pageFieldErrors(err)
          if (Object.keys(fieldErrors).some((field) => field !== "non_field_errors" && field !== "member_id")) {
            setErrors(fieldErrors)
            return
          }
          toast.show({
            title: "Couldn't add them",
            message: pageErrorSentence(err),
            variant: "error",
            position: "top-center",
          })
        },
      }
    )
  }

  return (
    <PageSheet
      title={picked ? `Add ${picked.name}` : "Add from members"}
      onClose={onClose}
      footer={
        picked
          ? (close) => (
              <Button variant="brand" fullWidth loading={create.isPending} onClick={() => submit(close)}>
                Add coach
              </Button>
            )
          : undefined
      }
    >
      {() =>
        picked ? (
          <div className={styles.sheetForm}>
            <button type="button" className={styles.backLink} onClick={() => setPicked(null)}>
              <Icon icon="mdi:arrow-left" width={18} height={18} aria-hidden="true" />
              Choose someone else
            </button>
            <div className={styles.pickedPerson}>
              <Avatar src={picked.photo || undefined} initials={initialsOf(picked.name)} size="md" />
              <span className={styles.rowText}>
                <span className={styles.rowName}>{picked.name}</span>
                <span className={styles.rowLine}>Name and photo come from their profile.</span>
              </span>
            </div>
            <CoachDetailsFields
              idBase={ids}
              value={details}
              onChange={(next) => {
                setDetails(next)
                setErrors({})
              }}
              errors={errors}
            />
          </div>
        ) : candidates.length === 0 ? (
          <div className={styles.sheetEmpty}>
            <p>Everyone on your page is already a coach here.</p>
            <Link href={`${orgAdminBase(orgId)}/members`} className={styles.textLink}>
              Add members to your page
            </Link>
          </div>
        ) : (
          <ul className={styles.pickList}>
            {candidates.map((candidate) => (
              <li key={candidate.member_id}>
                <button
                  type="button"
                  className={styles.pickRow}
                  onClick={() => {
                    setPicked(candidate)
                    setDetails(emptyCoachDetails())
                    setErrors({})
                  }}
                >
                  <Avatar src={candidate.photo || undefined} initials={initialsOf(candidate.name)} size="sm" />
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{candidate.name}</span>
                    {candidate.username && <span className={styles.rowLine}>@{candidate.username}</span>}
                  </span>
                  <span className={styles.roleChip}>{orgRoleLabel(candidate.role)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      }
    </PageSheet>
  )
}
