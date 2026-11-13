"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { Avatar, Button } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { keepFocusProps } from "@/shared/hooks/keepFocus"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { settleViewport } from "@/shared/utils/settleViewport"
import {
  CANDIDATE_MIN_CHARS,
  useInviteToSquad,
  useSquadCandidates,
  useSquadRoster,
} from "../../hooks/useSquads"
import { squadErrorCode, squadErrorSentence } from "../../squadErrors"
import { initialsOf } from "../../squadUtils"
import type { Candidate, SquadDetail } from "../../types"
import parts from "../sheetParts.module.css"
import SquadPlacementFields, {
  initialPlacement,
  placementBody,
  type PlacementValue,
} from "../SquadPlacementFields/SquadPlacementFields"
import SquadSheet from "../SquadSheet/SquadSheet"
import styles from "./InvitePlayerSheet.module.css"

const DEBOUNCE_MS = 300

function CandidateRow({
  candidate,
  onChoose,
}: {
  candidate: Candidate
  onChoose: (candidate: Candidate) => void
}) {
  const { user, primary_position: position, state } = candidate
  const tag = state === "invited" ? "Invited" : state === "active" ? "In squad" : null
  const person = (
    <>
      <Avatar src={user.photo || undefined} initials={initialsOf(user.name)} size="md" />
      <span className={parts.personText}>
        <span className={parts.personName}>{user.name}</span>
        <span className={parts.personSub}>
          @{user.username}
          {position ? ` · ${position.name}` : ""}
        </span>
      </span>
    </>
  )

  if (state === "pending") {
    // They already asked through the link: inviting them approves them at once.
    return (
      <li className={styles.pendingRow}>
        <span className={styles.pendingPerson}>{person}</span>
        <span className={styles.pendingSide}>
          <span className={parts.pickTag}>Asked to join</span>
          <Button size="sm" variant="brand" onClick={() => onChoose(candidate)} {...keepFocusProps}>
            Add now
          </Button>
        </span>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        className={parts.pickRow}
        disabled={state !== "none"}
        onClick={() => onChoose(candidate)}
        {...keepFocusProps}
      >
        {person}
        {tag ? (
          <span className={parts.pickTag}>{tag}</span>
        ) : (
          <Icon icon="mdi:chevron-right" width={20} height={20} aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

/**
 * Invite a player directly (squads.review): search Goatza's players, choose one,
 * place them, send. Someone who already asked to join is added at once — the
 * server answers "active" — so the toast says which happened.
 */
export default function InvitePlayerSheet({
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
  const searchId = `${ids}-search`
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [chosen, setChosen] = useState<Candidate | null>(null)
  const [placement, setPlacement] = useState<PlacementValue>({ positionId: "", jersey: "" })
  const [error, setError] = useState<string | null>(null)
  const [jerseyError, setJerseyError] = useState<string | undefined>()

  const invite = useInviteToSquad(orgId, squad.id)
  const { data: roster } = useSquadRoster(orgId, squad.id)
  const term = debounced.trim()
  const searching = term.length >= CANDIDATE_MIN_CHARS
  const { data: candidates, isFetching, isError } = useSquadCandidates(orgId, squad.id, debounced)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // Focus the search on desktop only: on a phone it throws the keyboard over
  // the sheet before the person has even seen it.
  useEffect(() => {
    if (isDesktop && !chosen) inputRef.current?.focus()
  }, [isDesktop, chosen])

  const choose = (candidate: Candidate) => {
    setChosen(candidate)
    setPlacement(initialPlacement(squad.config, candidate.primary_position?.id))
    setError(null)
    setJerseyError(undefined)
  }

  const send = (close: () => void) => {
    if (!chosen || invite.isPending) return
    const body = placementBody(squad.config, placement)
    if (body.invalid) {
      setJerseyError("Shirt numbers go from 0 to 99.")
      return
    }
    setError(null)
    setJerseyError(undefined)

    invite.mutate(
      { user_id: chosen.user.id, ...body.fields },
      {
        onSuccess: (row) => {
          toast.show({
            title: row.status === "active" ? `${chosen.user.name} added` : "Invite sent",
            variant: "success",
            position: "top-center",
          })
          void settleViewport()
          close()
        },
        onError: (err) => {
          const sentence = squadErrorSentence(err, {
            memberNoun: squad.config.member_noun,
            memberNounPlural: squad.config.member_noun_plural,
          })
          if (squadErrorCode(err) === "jersey_taken" || squadErrorCode(err) === "invalid_jersey") {
            setJerseyError(sentence)
          } else {
            setError(sentence)
          }
        },
      }
    )
  }

  const results = searching ? (candidates ?? []) : []

  return (
    <SquadSheet
      title="Invite a player"
      onClose={onClose}
      footer={
        chosen
          ? (close) => (
              <div className={parts.footer}>
                {error && (
                  <p className={parts.error} role="alert">
                    {error}
                  </p>
                )}
                <Button
                  variant="brand"
                  fullWidth
                  loading={invite.isPending}
                  disabled={invite.isPending}
                  onClick={() => send(close)}
                  {...keepFocusProps}
                >
                  {chosen.state === "pending" ? "Add now" : "Send invite"}
                </Button>
                <button
                  type="button"
                  className={parts.textButton}
                  disabled={invite.isPending}
                  onClick={() => {
                    setChosen(null)
                    setError(null)
                    setJerseyError(undefined)
                  }}
                >
                  Back
                </button>
              </div>
            )
          : undefined
      }
    >
      {() =>
        chosen ? (
          <div className={parts.content}>
            <div className={parts.person}>
              <Avatar
                src={chosen.user.photo || undefined}
                initials={initialsOf(chosen.user.name)}
                size="lg"
              />
              <span className={parts.personText}>
                <span className={parts.personName}>{chosen.user.name}</span>
                <span className={parts.personSub}>
                  @{chosen.user.username}
                  {chosen.primary_position ? ` · ${chosen.primary_position.name}` : ""}
                </span>
              </span>
            </div>

            <SquadPlacementFields
              config={squad.config}
              roster={roster}
              value={placement}
              onChange={(next) => {
                setPlacement(next)
                if (jerseyError) setJerseyError(undefined)
              }}
              profilePositionId={chosen.primary_position?.id}
              jerseyError={jerseyError}
              disabled={invite.isPending}
            />

            <p className={parts.note}>
              {chosen.state === "pending"
                ? `They asked to join, so they're added straight away. Their profile will show ${squad.name} as verified.`
                : `They join as soon as they accept. Their profile will show ${squad.name} as verified.`}
            </p>
          </div>
        ) : (
          <div className={parts.content}>
            <div className={parts.field}>
              <label className={parts.label} htmlFor={searchId}>
                Find a player
              </label>
              <div className={styles.searchWrap}>
                <Icon
                  icon="mdi:magnify"
                  width={20}
                  height={20}
                  className={styles.searchIcon}
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  id={searchId}
                  type="search"
                  className={`${parts.input} ${styles.search}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name or @username"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              </div>
            </div>

            {!searching ? (
              <p className={parts.hint}>Search by name or @username.</p>
            ) : isError && !candidates ? (
              <p className={parts.error} role="alert">
                Couldn&apos;t search right now. Try again.
              </p>
            ) : results.length === 0 && !isFetching ? (
              <p className={parts.empty}>No players found. Only player accounts can join squads.</p>
            ) : (
              <ul className={parts.pickList} aria-busy={isFetching || undefined}>
                {results.map((candidate) => (
                  <CandidateRow key={candidate.user.id} candidate={candidate} onChoose={choose} />
                ))}
              </ul>
            )}
          </div>
        )
      }
    </SquadSheet>
  )
}
