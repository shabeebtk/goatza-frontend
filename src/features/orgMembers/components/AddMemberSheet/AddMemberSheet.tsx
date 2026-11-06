"use client"

import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"

import type { OrgMemberRole } from "@/features/organization/types"
import { Avatar, Button, Select } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { settleViewport } from "@/shared/utils/settleViewport"
import { useInviteMember } from "../../hooks/useOrgMembers"
import { orgMemberErrorSentence } from "../../orgMemberErrors"
import { orgMemberKeys, searchPeopleApi, type InviteTarget } from "../../services/orgMembers.api"
import MembersSheet from "../MembersSheet/MembersSheet"
import styles from "./AddMemberSheet.module.css"

const SEARCH_DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

// A helper for a row, not a validator: the server decides what is deliverable.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Chosen =
  | { kind: "person"; id: string; name: string }
  | { kind: "email"; email: string }

/**
 * Add a member: find a person, or type an email.
 *
 * NEVER SAY WHETHER AN EMAIL HAS AN ACCOUNT. An address that looks like an email
 * does not reach the people search, so the row offered for it is the same whatever
 * is behind it, and so is the answer when it is sent.
 */
export default function AddMemberSheet({
  orgId,
  orgName,
  memberUserIds,
  invitedUserIds,
  onClose,
}: {
  orgId: string
  orgName: string
  memberUserIds: Set<string>
  invitedUserIds: Set<string>
  onClose: () => void
}) {
  const toast = useToast()
  const invite = useInviteMember(orgId)

  const [text, setText] = useState("")
  const [debounced, setDebounced] = useState("")
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [role, setRole] = useState<OrgMemberRole>("coach")
  const [error, setError] = useState<string | null>(null)

  const trimmed = text.trim()
  const isEmail = EMAIL_SHAPE.test(trimmed)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [trimmed])

  const query = debounced.replace(/^@/, "")
  const { data: people, isFetching } = useQuery({
    queryKey: orgMemberKeys.people(query),
    queryFn: () => searchPeopleApi(query),
    enabled: !isEmail && !EMAIL_SHAPE.test(debounced) && query.length >= MIN_QUERY_LENGTH,
    staleTime: 1000 * 60,
  })

  const roleOptions = [
    {
      value: "owner",
      label: "Owner",
      hint: `Can add and remove members and manage ${orgName}`,
    },
    { value: "coach", label: "Coach", hint: `Uses ${orgName}; can't manage members` },
    { value: "staff", label: "Staff", hint: `Uses ${orgName}; can't manage members` },
  ]

  const onType = (value: string) => {
    setText(value)
    setChosen(null)
    setError(null)
  }

  const send = (close: () => void) => {
    if (!chosen) return

    const target: InviteTarget =
      chosen.kind === "person" ? { user_id: chosen.id } : { email: chosen.email }

    setError(null)
    invite.mutate(
      { target, role },
      {
        onSuccess: () => {
          toast.show({ title: "Invite sent", variant: "success", position: "top-center" })
          void settleViewport()
          close()
        },
        onError: (err) => setError(orgMemberErrorSentence(err, orgName)),
      }
    )
  }

  const results = isEmail ? [] : (people ?? [])
  const searched = !isEmail && query.length >= MIN_QUERY_LENGTH

  return (
    <MembersSheet
      title="Add member"
      onClose={onClose}
      footer={(close) => (
        <Button
          variant="brand"
          fullWidth
          loading={invite.isPending}
          disabled={!chosen || invite.isPending}
          onClick={() => send(close)}
          {...keepFocusProps}
        >
          Send invite
        </Button>
      )}
    >
      {() => (
        <div className={styles.content}>
          <label className={styles.label} htmlFor="add-member-search">
            Name, @username or email
          </label>
          <input
            id="add-member-search"
            className={styles.input}
            type="text"
            value={text}
            onChange={(event) => onType(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search or type an email"
          />

          {isEmail && (
            <button
              type="button"
              className={`${styles.row} ${chosen?.kind === "email" ? styles.rowChosen : ""}`}
              onClick={() => setChosen({ kind: "email", email: trimmed })}
              {...keepFocusProps}
            >
              <span className={styles.mailIcon} aria-hidden="true">
                <Icon icon="mdi:email-outline" width={18} height={18} />
              </span>
              <span className={styles.rowText}>Invite {trimmed} by email</span>
              {chosen?.kind === "email" && (
                <Icon icon="mdi:check-circle" width={18} height={18} className={styles.check} />
              )}
            </button>
          )}

          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((person) => {
                const label = memberUserIds.has(person.id)
                  ? "Member"
                  : invitedUserIds.has(person.id)
                    ? "Invited"
                    : null
                const isChosen = chosen?.kind === "person" && chosen.id === person.id

                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      className={`${styles.row} ${isChosen ? styles.rowChosen : ""}`}
                      disabled={!!label}
                      onClick={() =>
                        setChosen({ kind: "person", id: person.id, name: person.name })
                      }
                      {...keepFocusProps}
                    >
                      <Avatar
                        src={person.avatar}
                        initials={person.name?.slice(0, 2).toUpperCase() || "?"}
                        size="sm"
                      />
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{person.name}</span>
                        <span className={styles.rowHandle}>@{person.username}</span>
                      </span>
                      {label && <span className={styles.rowTag}>{label}</span>}
                      {isChosen && (
                        <Icon
                          icon="mdi:check-circle"
                          width={18}
                          height={18}
                          className={styles.check}
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {searched && !isFetching && people?.length === 0 && (
            <p className={styles.hint}>No one found. You can also type their email.</p>
          )}

          <Select
            label="Role"
            sheetTitle="Role"
            options={roleOptions}
            value={role}
            onChange={(value) => setRole(value as OrgMemberRole)}
          />

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </MembersSheet>
  )
}
