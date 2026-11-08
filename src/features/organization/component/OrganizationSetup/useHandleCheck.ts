"use client"

/**
 * useHandleCheck — is this page link free? Debounced, and answerable on demand.
 *
 * The format is checked first with the shared validator, so a handle the
 * server would refuse never costs a request. A well-formed one is checked
 * 400 ms after the last keystroke with `for: "organization"`: the person's
 * own handle counts as TAKEN for their page. Answers are kept per handle, so
 * typing back to an earlier value answers at once.
 *
 * The status is DERIVED for the current handle (format answer, a kept server
 * answer, or "checking" while neither exists); only the server's answers are
 * state, and they arrive asynchronously.
 *
 * `flush()` is what Continue awaits: it skips the wait and resolves with the
 * answer for the current handle. A check that failed for want of a
 * connection resolves as "error" — shown, never cached as final (flush asks
 * again), and it does not block Continue: the create is the final word.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { checkUsernameApi } from "@/features/profile/services/profile.api"
import { validateHandle } from "./createPageDraft"

export const HANDLE_CHECK_DEBOUNCE_MS = 400

export type HandleStatus =
  | { state: "idle" }
  | { state: "checking"; handle: string }
  | { state: "available"; handle: string }
  | { state: "taken"; handle: string; suggestion?: string }
  | { state: "invalid"; handle: string; message: string }
  | { state: "error"; handle: string }

type Answer = Exclude<HandleStatus, { state: "idle" } | { state: "checking" }>

const IDLE: HandleStatus = { state: "idle" }

const key = (handle: string) => handle.trim().toLowerCase()

/** The answer that needs no server: empty, or not a valid handle at all. */
function localAnswer(value: string): HandleStatus | null {
  if (!value) return IDLE
  const formatError = validateHandle(value)
  return formatError ? { state: "invalid", handle: value, message: formatError } : null
}

export function useHandleCheck(handle: string, enabled = true) {
  const value = key(handle)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const pendingRef = useRef(new Map<string, Promise<Answer>>())

  const remember = useCallback((answer: Answer) => {
    setAnswers((current) => ({ ...current, [answer.handle]: answer }))
  }, [])

  const run = useCallback((handleKey: string): Promise<Answer> => {
    const inFlight = pendingRef.current.get(handleKey)
    if (inFlight) return inFlight

    const promise = checkUsernameApi(handleKey, { for: "organization" })
      .then((result): Answer => {
        if (!result.valid) {
          return {
            state: "invalid",
            handle: handleKey,
            message: result.message || "This page link isn't allowed",
          }
        }
        return result.available
          ? { state: "available", handle: handleKey }
          : { state: "taken", handle: handleKey, suggestion: result.suggestion }
      })
      .catch((): Answer => ({ state: "error", handle: handleKey }))
      .then((answer) => {
        pendingRef.current.delete(handleKey)
        remember(answer)
        return answer
      })

    pendingRef.current.set(handleKey, promise)
    return promise
  }, [remember])

  const kept = answers[value]
  const status: HandleStatus = !enabled
    ? IDLE
    : localAnswer(value) ?? kept ?? { state: "checking", handle: value }

  // Ask the server once the typing stops — only for a well-formed handle with
  // no answer yet.
  const needsCheck = enabled && !localAnswer(value) && !kept
  useEffect(() => {
    if (!needsCheck) return
    const timer = setTimeout(() => void run(value), HANDLE_CHECK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [needsCheck, run, value])

  /** Resolve the current handle's answer now (Continue waits on this). */
  const flush = useCallback((): Promise<HandleStatus> => {
    const local = localAnswer(value)
    if (local) return Promise.resolve(local)
    if (kept && kept.state !== "error") return Promise.resolve(kept)
    return run(value)
  }, [kept, run, value])

  /**
   * The create came back "taken" for this handle (somebody got there between
   * the check and the create). Remembered at once, then asked once more in the
   * background so the answer carries a suggestion.
   */
  const markTaken = useCallback((raw: string) => {
    const handleKey = key(raw)
    pendingRef.current.delete(handleKey)
    remember({ state: "taken", handle: handleKey })
    void checkUsernameApi(handleKey, { for: "organization" })
      .then((result) => {
        remember({
          state: "taken",
          handle: handleKey,
          suggestion: result.available ? undefined : result.suggestion,
        })
      })
      .catch(() => undefined)
  }, [remember])

  return { status, flush, markTaken }
}
