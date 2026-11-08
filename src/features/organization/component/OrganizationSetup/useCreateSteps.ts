"use client"

/**
 * useCreateSteps — the create page's step lives in the URL (`?step=basics`).
 *
 * Moving forward is a `router.push` (scroll: false; the page scrolls itself),
 * so the phone's back gesture goes to the previous step instead of leaving
 * the flow. The page's own Back button goes back through history when the
 * entry underneath IS the previous step, and replaces the URL when it is not
 * (after a refresh, or after "Edit" jumped here from Review), so it never
 * walks somewhere unexpected.
 *
 * THE ENTRY UNDER STEP 1. Arriving at `/organization/create` with no step
 * pushes `?step=type` on top of it. A back press on step 1 then lands on that
 * bare entry instead of leaving, and `onBackToBase` decides: ask "Discard
 * this page?" when there is something to lose, or carry on out. Arriving at
 * `?step=type` directly (a refresh) has no such entry; Back still asks, the
 * gesture does not, and the draft is kept either way.
 *
 * What is underneath is tracked in memory (`trail`), from the pushes this
 * hook made and the URL changes it saw. Overlay entries (a crop sheet, a
 * ConfirmDialog) sit on the same URL, so they never change the step and are
 * ignored here.
 */

import { useCallback, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CREATE_STEPS, isCreateStep, stepIndex, type CreateStep } from "./createPageDraft"

export const CREATE_PAGE_PATH = "/organization/create"
export const stepUrl = (step: CreateStep) => `${CREATE_PAGE_PATH}?step=${step}`

/** A step, or "" for the bare entry under step 1. */
type TrailKey = CreateStep | ""

export function useCreateSteps({
  ready,
  resolveStart,
  onBackToBase,
}: {
  /** Nothing happens until the draft has been restored. */
  ready: boolean
  /** Where a fresh arrival at `step` should really be (the deep-link rule). */
  resolveStart: (step: CreateStep) => CreateStep
  /** Back was pressed on step 1; the browser is on the entry beneath it. */
  onBackToBase: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get("step")
  const step: CreateStep = isCreateStep(raw) ? raw : "type"

  const trailRef   = useRef<TrailKey[]>([])
  const lastKeyRef = useRef<TrailKey | "invalid" | null>(null)
  const expectRef  = useRef<{ kind: "push" | "replace"; key: TrailKey } | null>(null)

  const resolveStartRef = useRef(resolveStart)
  const onBackToBaseRef = useRef(onBackToBase)
  useEffect(() => {
    resolveStartRef.current = resolveStart
    onBackToBaseRef.current = onBackToBase
  })

  const goTo = useCallback((next: CreateStep) => {
    expectRef.current = { kind: "push", key: next }
    router.push(stepUrl(next), { scroll: false })
  }, [router])

  const replaceStep = useCallback((next: CreateStep) => {
    expectRef.current = { kind: "replace", key: next }
    router.replace(stepUrl(next), { scroll: false })
  }, [router])

  useEffect(() => {
    if (!ready) return
    const key: TrailKey | "invalid" =
      raw === null ? "" : isCreateStep(raw) ? raw : "invalid"
    // Only a CHANGE of step means anything (StrictMode re-runs, a re-render
    // after `ready`, an overlay's own history entry: none of them do).
    if (lastKeyRef.current === key) return
    const previous = lastKeyRef.current
    lastKeyRef.current = key

    if (key === "invalid") {
      replaceStep("type")
      return
    }

    const trail = trailRef.current
    const expected = expectRef.current
    expectRef.current = null

    if (expected && expected.key === key) {
      if (expected.kind === "push" || trail.length === 0) trail.push(key)
      else trail[trail.length - 1] = key
    } else if (trail.length >= 2 && trail[trail.length - 2] === key) {
      trail.pop()
    } else {
      trailRef.current = [key]
    }

    if (previous === null) {
      // The first arrival in this mount.
      if (key === "") {
        goTo("type")
        return
      }
      const target = resolveStartRef.current(key)
      if (target !== key) replaceStep(target)
      return
    }

    if (key === "") onBackToBaseRef.current()
  }, [raw, ready, goTo, replaceStep])

  /**
   * The page's own Back. Returns false on step 1 when there is no entry of
   * ours underneath, so the caller decides how to leave.
   */
  const back = useCallback((): boolean => {
    const index = stepIndex(step)
    const trail = trailRef.current
    const below = trail.length >= 2 ? trail[trail.length - 2] : null

    if (index === 0) {
      if (below === "") {
        router.back()
        return true
      }
      return false
    }

    const previous = CREATE_STEPS[index - 1]
    if (below === previous) router.back()
    else replaceStep(previous)
    return true
  }, [router, step, replaceStep])

  return {
    step,
    /** True while the browser is on the bare entry under step 1. */
    atBase: raw === null,
    goTo,
    replaceStep,
    back,
  }
}
