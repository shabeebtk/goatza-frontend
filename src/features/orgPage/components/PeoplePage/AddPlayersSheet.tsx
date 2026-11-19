"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useAddPlayer, usePlayers } from "../../hooks/usePeople"
import { pageErrorSentence } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import PageSheet from "../PageSheet/PageSheet"
import { cantShowReason, playerLine } from "./playerFormat"
import { initialsOf } from "./coachFields"
import styles from "./PeoplePage.module.css"

const DEBOUNCE_MS = 300

/**
 * Pick players to show: the verified players not picked yet, narrowed by name
 * through ?q= (300 ms after typing stops). One a private profile (or an account
 * that can't be shown) is listed, disabled, with the reason.
 */
export default function AddPlayersSheet({
  orgId,
  noun,
  onClose,
}: {
  orgId: string
  noun: string
  onClose: () => void
}) {
  const ids = useId()
  const toast = useToast()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [added, setAdded] = useState<string[]>([])
  const add = useAddPlayer(orgId)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const { data, isLoading, isFetching } = usePlayers(orgId, debounced)
  const candidates = data?.candidates ?? []
  const searching = debounced.trim().length > 0

  return (
    <PageSheet title="Add players" onClose={onClose}>
      {() => (
        <div className={styles.sheetForm}>
          <div className={styles.search}>
            <Icon icon="mdi:magnify" width={20} height={20} className={styles.searchIcon} aria-hidden="true" />
            <label htmlFor={`${ids}-q`} className={styles.srOnly}>
              Search players
            </label>
            <input
              id={`${ids}-q`}
              type="search"
              className={styles.searchInput}
              placeholder="Search by name"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {isFetching && <span className={styles.searchSpinner} aria-hidden="true" />}
          </div>

          {isLoading ? (
            <div className={styles.skeleton} aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span key={index} style={{ height: 60 }} />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            searching ? (
              <p className={styles.quiet}>Nobody by that name.</p>
            ) : (
              <div className={styles.sheetEmpty}>
                <p>Verify a player&apos;s time at your {noun} on Verify, then pick them here.</p>
                <Link href={`${orgAdminBase(orgId)}/verifications`} className={styles.textLink}>
                  Go to Verify
                </Link>
              </div>
            )
          ) : (
            <ul className={styles.pickList} aria-busy={isFetching || undefined}>
              {candidates.map((candidate) => {
                const reason = cantShowReason(candidate)
                const isAdded = added.includes(candidate.user.id)
                const adding = add.isPending && add.variables?.user_id === candidate.user.id
                return (
                  <li key={candidate.user.id} className={`${styles.candidate} ${reason ? styles.candidateOff : ""}`}>
                    <Avatar
                      src={candidate.user.photo || undefined}
                      initials={initialsOf(candidate.user.name)}
                      size="sm"
                    />
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{candidate.user.name}</span>
                      <span className={styles.rowLine}>{reason ?? playerLine(candidate)}</span>
                    </span>
                    {isAdded ? (
                      <span className={styles.addedTag}>
                        <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />
                        Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.addButton}
                        disabled={Boolean(reason) || adding}
                        aria-label={`Add ${candidate.user.name}`}
                        onClick={() =>
                          add.mutate(
                            { user_id: candidate.user.id },
                            {
                              onSuccess: () => setAdded((current) => [...current, candidate.user.id]),
                              onError: (err) =>
                                toast.show({
                                  title: "Couldn't add them",
                                  message: pageErrorSentence(err),
                                  variant: "error",
                                  position: "top-center",
                                }),
                            }
                          )
                        }
                      >
                        {adding ? "Adding…" : "Add"}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </PageSheet>
  )
}
