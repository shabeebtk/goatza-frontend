"use client"

import { useId, useMemo, useState } from "react"
import { Icon } from "@iconify/react"

import { useOrgMembers } from "@/features/orgMembers/hooks/useOrgMembers"
import { Avatar, Button, Select } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useAddSquadStaff } from "../../hooks/useSquads"
import { squadErrorSentence } from "../../squadErrors"
import { initialsOf } from "../../squadUtils"
import type { SquadDetail, StaffRole } from "../../types"
import parts from "../sheetParts.module.css"
import SquadSheet from "../SquadSheet/SquadSheet"

export const STAFF_TITLE_MAX = 40

export const STAFF_ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "head_coach", label: "Head coach" },
  { value: "assistant_coach", label: "Assistant coach" },
  { value: "manager", label: "Team manager" },
  { value: "physio", label: "Physio" },
  { value: "other", label: "Other" },
]

/**
 * Put one of the club's members on this squad's staff (squads.manage). Staff come
 * from the org's own members — a squad's coach is someone who already helps run
 * the club — so it searches that list, not Goatza.
 */
export default function AddStaffSheet({
  orgId,
  squad,
  onClose,
}: {
  orgId: string
  squad: SquadDetail
  onClose: () => void
}) {
  const toast = useToast()
  const ids = useId()
  const filterId = `${ids}-filter`
  const titleId = `${ids}-title`
  const { data, isLoading, isError, refetch } = useOrgMembers(orgId)
  const add = useAddSquadStaff(orgId, squad.id)

  const [filter, setFilter] = useState("")
  const [memberId, setMemberId] = useState<string | null>(null)
  const [role, setRole] = useState<StaffRole>("head_coach")
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)

  const onStaff = useMemo(() => new Set(squad.staff.map((staff) => staff.member_id)), [squad.staff])
  const people = useMemo(() => {
    const term = filter.trim().toLowerCase().replace(/^@/, "")
    return (data?.members ?? [])
      .filter((member) => !onStaff.has(member.id))
      .filter(
        (member) =>
          !term ||
          member.user.name.toLowerCase().includes(term) ||
          member.user.username.toLowerCase().includes(term)
      )
  }, [data, filter, onStaff])

  const chosen = data?.members.find((member) => member.id === memberId) ?? null

  const submit = (close: () => void) => {
    if (!chosen || add.isPending) return
    const trimmedTitle = title.trim()
    setError(null)
    add.mutate(
      {
        member_id: chosen.id,
        role,
        ...(role === "other" && trimmedTitle ? { title: trimmedTitle } : {}),
      },
      {
        onSuccess: () => {
          toast.show({
            title: `${chosen.user.name} added to staff`,
            variant: "success",
            position: "top-center",
          })
          void settleViewport()
          close()
        },
        onError: (err) => setError(squadErrorSentence(err)),
      }
    )
  }

  return (
    <SquadSheet
      title="Add staff"
      onClose={onClose}
      footer={(close) => (
        <div className={parts.footer}>
          {error && (
            <p className={parts.error} role="alert">
              {error}
            </p>
          )}
          <Button
            variant="brand"
            fullWidth
            loading={add.isPending}
            disabled={!chosen || add.isPending}
            onClick={() => submit(close)}
            {...keepFocusProps}
          >
            Add
          </Button>
        </div>
      )}
    >
      {() => (
        <div className={parts.content}>
          <div className={parts.field}>
            <label className={parts.label} htmlFor={filterId}>
              Member
            </label>
            <input
              id={filterId}
              type="search"
              className={parts.input}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search your club's members"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

          {isLoading ? (
            <p className={parts.hint}>Loading members…</p>
          ) : isError && !data ? (
            <p className={parts.error} role="alert">
              Couldn&apos;t load your club&apos;s members.{" "}
              <button type="button" className={parts.textButton} onClick={() => refetch()}>
                Try again
              </button>
            </p>
          ) : people.length === 0 ? (
            <p className={parts.empty}>
              {filter.trim()
                ? "No members match."
                : "Everyone in your club is already on this squad's staff."}
            </p>
          ) : (
            <ul className={parts.pickList}>
              {people.map((member) => {
                const isChosen = member.id === memberId
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      className={`${parts.pickRow} ${isChosen ? parts.pickRowOn : ""}`}
                      aria-pressed={isChosen}
                      onClick={() => setMemberId(isChosen ? null : member.id)}
                      {...keepFocusProps}
                    >
                      <Avatar
                        src={member.user.profile_photo || undefined}
                        initials={initialsOf(member.user.name)}
                        size="md"
                      />
                      <span className={parts.personText}>
                        <span className={parts.personName}>{member.user.name}</span>
                        <span className={parts.personSub}>@{member.user.username}</span>
                      </span>
                      {isChosen && (
                        <Icon
                          icon="mdi:check-circle"
                          width={20}
                          height={20}
                          className={parts.pickCheck}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {chosen && (
            <>
              <Select
                label="Role"
                sheetTitle="Role"
                options={STAFF_ROLE_OPTIONS}
                value={role}
                onChange={(value) => setRole(value as StaffRole)}
                disabled={add.isPending}
              />

              {role === "other" && (
                <div className={parts.field}>
                  <label className={parts.label} htmlFor={titleId}>
                    Title <span className={parts.optional}>(optional)</span>
                  </label>
                  <input
                    id={titleId}
                    className={parts.input}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={STAFF_TITLE_MAX}
                    placeholder="Goalkeeping coach"
                    autoComplete="off"
                    disabled={add.isPending}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SquadSheet>
  )
}
