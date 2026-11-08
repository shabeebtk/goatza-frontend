"use client"

/**
 * Create a page (club / team / academy / school) — the frame.
 *
 * Four steps (Type · Basics · Location & sports · Review), each its own
 * component in this folder. The frame owns what they share:
 *
 * - The step is in the URL (useCreateSteps), so the phone's back gesture goes
 *   to the previous step and a refresh stays put.
 * - The draft (everything but the photos) is kept in sessionStorage and
 *   restored on reload; it is cleared once the page exists or is discarded.
 * - Leaving with something entered — Back on step 1, the bare entry under it,
 *   or a link in the app nav — asks "Discard this page?" first.
 * - Validation on blur and on Continue; the first error is scrolled to and
 *   focused. Every step change scrolls to the top and focuses its heading.
 * - Eligibility is asked on mount: at the limit, a friendly state replaces
 *   the form. The create can still answer `org_limit`; it lands there too.
 *
 * Phone (<768): a focused screen. AppNav hides its bars on this route, and the
 * page is one fixed scroll container that follows the visible area, with a
 * sticky header (back, title, "Step 2 of 4", progress) and a sticky footer.
 * Desktop: a centred card with a labelled stepper; from 1024px a live
 * preview of the header sits beside it.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useFocusedFieldVisible } from "@/shared/hooks/useFocusedFieldVisible"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import { useScreenWakeLock } from "@/shared/hooks/useScreenWakeLock"
import { useSmartBack } from "@/shared/hooks/useSmartBack"
import { useAuthStore } from "@/store/auth.store"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useProfileBias } from "@/features/profile/hooks/useProfileBias"
import { useCreateEligibility } from "../../hooks/useOrganizations"
import { createPhaseLabel, useCreateOrganization } from "../../hooks/useCreateOrganization"
import { toCreateOrgError, type CreateOrgError } from "../../services/organization.api"
import type { OrgPhotoType } from "../../services/uploadOrgPhoto"
import {
  CREATE_STEPS,
  EMPTY_DRAFT,
  FIELD_STEP,
  SERVER_FIELD,
  STEP_FIELDS,
  buildCreatePayload,
  clearDraft,
  firstErrorField,
  firstIncompleteStep,
  isDraftDirty,
  loadDraft,
  normalizeHandleInput,
  normalizeWebsite,
  saveDraft,
  stepIndex,
  toHandle,
  validateField,
  validateStep,
  type CreateDraft,
  type CreateField,
  type CreateStep,
  type FieldErrors,
} from "./createPageDraft"
import { fieldId } from "./CreateField"
import { useCreateSteps, CREATE_PAGE_PATH } from "./useCreateSteps"
import { useHandleCheck } from "./useHandleCheck"
import TypeStep from "./TypeStep"
import BasicsStep from "./BasicsStep"
import LocationSportsStep from "./LocationSportsStep"
import ReviewStep from "./ReviewStep"
import PagePreview from "./PagePreview"
import CreateStepper from "./CreateStepper"
import CreateLimitState from "./CreateLimitState"
import type { PickedPhoto } from "./HeaderComposer"
import styles from "./OrganizationSetup.module.css"

export const OFFLINE_CREATE_MESSAGE = "You're offline. Check your connection and try again."

/** The draft keys → the field whose error they can clear. */
const DRAFT_KEY_FIELD: Partial<Record<keyof CreateDraft, CreateField>> = {
  type:        "type",
  name:        "name",
  username:    "username",
  headline:    "headline",
  level:       "level",
  description: "description",
  website:     "website",
  city:        "city",
  branchName:  "branchName",
  address:     "address",
  sportIds:    "sports",
}

/** "goatza.com", from NEXT_PUBLIC_SITE_URL. */
function siteHost(): string {
  try {
    const configured = process.env.NEXT_PUBLIC_SITE_URL
    if (configured) return new URL(configured).host
  } catch {
    // A malformed value falls through to the default.
  }
  return "goatza.com"
}

const without = (errors: FieldErrors, fields: CreateField[]): FieldErrors => {
  const next = { ...errors }
  for (const field of fields) delete next[field]
  return next
}

type Confirm =
  | { reason: "base" }
  | { reason: "back" }
  | { reason: "link"; href: string }

export default function OrganizationSetup() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const smartBack = useSmartBack("/home")

  const sportsQuery = useSportsList()
  const sports = sportsQuery.data ?? []
  const placeBias = useProfileBias()
  const organizations = useAuthStore((state) => state.organizations)

  // ── State ──────────────────────────────────────────────────────
  const [draft, setDraft]             = useState<CreateDraft>(EMPTY_DRAFT)
  const [restored, setRestored]       = useState(false)
  const [errors, setErrors]           = useState<FieldErrors>({})
  const [logo, setLogo]               = useState<PickedPhoto | null>(null)
  const [cover, setCover]             = useState<PickedPhoto | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [limitHit, setLimitHit]       = useState(false)
  const [confirm, setConfirm]         = useState<Confirm | null>(null)
  const [continuing, setContinuing]   = useState(false)
  const [done, setDone]               = useState(false)

  // Latest values for callbacks that outlive a render (history, listeners).
  const draftRef = useRef(draft)
  const photosRef = useRef<{ logo: PickedPhoto | null; cover: PickedPhoto | null }>({ logo, cover })
  useEffect(() => {
    draftRef.current = draft
    photosRef.current = { logo, cover }
  })

  /** False once the page exists or was discarded: nothing more is saved. */
  const persistRef = useRef(true)
  const leavingRef = useRef(false)
  const pendingFocusRef = useRef<CreateField | null>(null)
  const submittingRef = useRef(false)
  const continueTokenRef = useRef(0)

  const isDirty = useCallback(
    () =>
      isDraftDirty(draftRef.current) ||
      !!photosRef.current.logo ||
      !!photosRef.current.cover,
    []
  )

  // ── Draft: restore once, then save every change ───────────────
  useEffect(() => {
    const saved = loadDraft()
    if (saved) setDraft(saved)
    setRestored(true)
  }, [])

  useEffect(() => {
    if (restored && persistRef.current) saveDraft(draft)
  }, [draft, restored])

  // Object URLs of the cropped photos: revoked when replaced and on unmount.
  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo.url) }, [logo])
  useEffect(() => () => { if (cover) URL.revokeObjectURL(cover.url) }, [cover])

  // ── Eligibility ────────────────────────────────────────────────
  const eligibility = useCreateEligibility()
  const atLimit = !done && (limitHit || eligibility.data?.allowed === false)
  // A failed eligibility read shows the form: the create re-checks anyway.
  const showWizard = !eligibility.isPending && !atLimit
  const ready = restored && showWizard

  // ── Leaving ────────────────────────────────────────────────────
  const leave = useCallback(() => {
    leavingRef.current = true
    smartBack()
  }, [smartBack])

  const discard = useCallback(() => {
    persistRef.current = false
    leavingRef.current = true
    clearDraft()
  }, [])

  // ── Steps ──────────────────────────────────────────────────────
  const { step, goTo, back } = useCreateSteps({
    ready,
    resolveStart: (wanted) => {
      const first = firstIncompleteStep(draftRef.current)
      return first && stepIndex(first) < stepIndex(wanted) ? first : wanted
    },
    onBackToBase: () => {
      if (leavingRef.current) return
      if (isDirty()) setConfirm({ reason: "base" })
      else leave()
    },
  })
  const index = stepIndex(step)

  // ── The page link check ────────────────────────────────────────
  const handleCheck = useHandleCheck(draft.username, ready)

  // ── Create ─────────────────────────────────────────────────────
  const create = useCreateOrganization({
    beforeLanding: () => {
      persistRef.current = false
      leavingRef.current = true
      clearDraft()
      setDone(true)
    },
  })
  const busy = create.isPending || done
  useScreenWakeLock(create.isPending)

  // ── Phone frame ────────────────────────────────────────────────
  const screenRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useVisualViewport()
  useFocusedFieldVisible(screenRef, ready)

  // Every step change: back to the top, focus on the step's heading — unless
  // the change was a jump to a field, which gets the focus instead.
  const shownStepRef = useRef<CreateStep | null>(null)
  useEffect(() => {
    if (!ready) return
    if (shownStepRef.current === null || shownStepRef.current === step) {
      shownStepRef.current = step
      return
    }
    shownStepRef.current = step
    if (pendingFocusRef.current) return
    screenRef.current?.scrollTo?.({ top: 0 })
    try {
      window.scrollTo({ top: 0 })
    } catch {
      // Not every environment scrolls the window.
    }
    headingRef.current?.focus({ preventScroll: true })
  }, [step, ready])

  // A field asked for focus (first error, a server error): once it is on
  // screen, scroll it into view and focus it — or the first focusable in it.
  useEffect(() => {
    const field = pendingFocusRef.current
    if (!field) return
    const element = document.getElementById(fieldId(field))
    if (!element) return
    pendingFocusRef.current = null
    const target = element.matches("input, textarea, button, [tabindex]")
      ? element
      : element.querySelector<HTMLElement>('[tabindex="0"], input, textarea, button')
    element.scrollIntoView?.({ block: "center" })
    ;(target ?? element).focus?.({ preventScroll: true })
  })

  const focusField = useCallback(
    (field: CreateField) => {
      pendingFocusRef.current = field
      if (FIELD_STEP[field] !== step) goTo(FIELD_STEP[field])
      else setErrors((current) => ({ ...current })) // a render, so the effect runs
    },
    [goTo, step]
  )

  // ── Edits ──────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<CreateDraft>) => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    setSubmitError(null)
    // A field showing an error is re-checked as it is edited, so the error
    // goes the moment it is fixed.
    setErrors((current) => {
      let changed = false
      const updated = { ...current }
      for (const key of Object.keys(patch) as (keyof CreateDraft)[]) {
        const field = DRAFT_KEY_FIELD[key]
        if (!field || !updated[field]) continue
        const message = validateField(field, next)
        if (message) updated[field] = message
        else delete updated[field]
        changed = true
      }
      return changed ? updated : current
    })
  }, [])

  const onName = useCallback((name: string) => {
    const patch: Partial<CreateDraft> = { name }
    if (!draftRef.current.usernameEdited) patch.username = toHandle(name)
    update(patch)
  }, [update])

  const onHandle = useCallback(
    (raw: string) => update({ username: normalizeHandleInput(raw), usernameEdited: true }),
    [update]
  )

  const onUseSuggestion = useCallback((handle: string) => {
    update({ username: handle, usernameEdited: true })
    pendingFocusRef.current = "username"
  }, [update])

  const onBlurField = useCallback((field: CreateField) => {
    let current = draftRef.current
    if (field === "website") {
      const normalized = normalizeWebsite(current.website)
      if (normalized !== current.website) {
        update({ website: normalized })
        current = draftRef.current
      }
    }
    const message = validateField(field, current)
    setErrors((existing) => {
      if (message) return { ...existing, [field]: message }
      if (!existing[field]) return existing
      const next = { ...existing }
      delete next[field]
      return next
    })
  }, [update])

  const onPhoto = useCallback(
    (type: OrgPhotoType, photo: { blob: Blob; name: string } | null) => {
      const next = photo ? { ...photo, url: URL.createObjectURL(photo.blob) } : null
      if (type === "logo") setLogo(next)
      else setCover(next)
      setSubmitError(null)
      setErrors((current) => (current.photos ? without(current, ["photos"]) : current))
    },
    []
  )

  // ── Footer actions ─────────────────────────────────────────────
  const onBack = useCallback(() => {
    if (busy) return
    if (back()) return
    // Step 1 with nothing of ours underneath: leave from here.
    if (isDirty()) setConfirm({ reason: "back" })
    else leave()
  }, [back, busy, isDirty, leave])

  const onContinue = useCallback(async () => {
    if (busy || continuing) return
    setSubmitError(null)

    let current = draftRef.current
    if (step === "basics") {
      const website = normalizeWebsite(current.website)
      if (website !== current.website) {
        update({ website })
        current = draftRef.current
      }
    }

    const stepErrors = validateStep(step, current)
    setErrors((existing) => ({ ...without(existing, STEP_FIELDS[step]), ...stepErrors }))
    const first = firstErrorField(stepErrors)
    if (first) {
      focusField(first)
      return
    }

    if (step === "basics") {
      // Wait for the page link's answer; a taken or invalid one stops here.
      const token = ++continueTokenRef.current
      setContinuing(true)
      const answer = await handleCheck.flush()
      setContinuing(false)
      if (token !== continueTokenRef.current) return
      if (answer.state === "taken" || answer.state === "invalid") {
        focusField("username")
        return
      }
    }

    const next = CREATE_STEPS[index + 1]
    if (next) goTo(next)
  }, [busy, continuing, focusField, goTo, handleCheck, index, step, update])

  const applyCreateError = useCallback((error: CreateOrgError) => {
    const current = draftRef.current
    switch (error.code) {
      case "org_limit":
        setLimitHit(true)
        return
      case "username_taken":
        handleCheck.markTaken(current.username)
        setErrors((existing) => ({ ...existing, username: error.message }))
        setSubmitError("That page link was just taken. Pick another one.")
        focusField("username")
        return
      case "username_invalid":
        setErrors((existing) => ({ ...existing, username: error.message }))
        setSubmitError(error.message)
        focusField("username")
        return
      case "invalid": {
        const mapped: FieldErrors = {}
        for (const [serverField, message] of Object.entries(error.fields)) {
          const field = SERVER_FIELD[serverField]
          if (field && !mapped[field]) mapped[field] = message
        }
        if (Object.keys(mapped).length === 0 && error.field && SERVER_FIELD[error.field]) {
          mapped[SERVER_FIELD[error.field]] = error.message
        }
        setErrors((existing) => ({ ...existing, ...mapped }))
        setSubmitError(error.message)
        const first = firstErrorField(mapped)
        if (first) focusField(first)
        return
      }
      default:
        setSubmitError(error.message)
    }
  }, [focusField, handleCheck])

  const onCreate = useCallback(async () => {
    if (submittingRef.current || busy) return
    setSubmitError(null)

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSubmitError(OFFLINE_CREATE_MESSAGE)
      return
    }

    const current = draftRef.current
    const incomplete = firstIncompleteStep(current)
    if (incomplete) {
      const stepErrors = validateStep(incomplete, current)
      setErrors((existing) => ({ ...existing, ...stepErrors }))
      const first = firstErrorField(stepErrors)
      if (first) focusField(first)
      else goTo(incomplete)
      return
    }

    submittingRef.current = true
    try {
      const photos = photosRef.current
      await create.mutateAsync({
        payload: buildCreatePayload(current),
        logo:  photos.logo ? { blob: photos.logo.blob, name: photos.logo.name } : null,
        cover: photos.cover ? { blob: photos.cover.blob, name: photos.cover.name } : null,
      })
    } catch (err) {
      applyCreateError(toCreateOrgError(err))
    } finally {
      submittingRef.current = false
    }
  }, [applyCreateError, busy, create, focusField, goTo])

  // ── A link out of the page, with something entered, asks first ─
  useEffect(() => {
    if (!ready || done) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || url.pathname === CREATE_PAGE_PATH) return
      if (leavingRef.current || !isDirty()) return
      // Capture phase on the document: next/link's own handler never runs.
      event.preventDefault()
      event.stopPropagation()
      setConfirm({ reason: "link", href: `${url.pathname}${url.search}${url.hash}` })
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [done, isDirty, ready])

  const onConfirmDiscard = useCallback(() => {
    const asked = confirm
    setConfirm(null)
    discard()
    if (asked?.reason === "link") router.push(asked.href)
    else leave()
  }, [confirm, discard, leave, router])

  const onKeepEditing = useCallback(() => {
    const asked = confirm
    setConfirm(null)
    // Back on step 1 landed on the entry beneath it: put step 1 back on top.
    if (asked?.reason === "base") goTo("type")
  }, [confirm, goTo])

  const openOrganization = useCallback((organizationId: string) => {
    useAuthStore.getState().switchToOrganization(organizationId)
    queryClient.clear()
    router.push(`/organization/admin/${organizationId}/dashboard`)
  }, [queryClient, router])

  // ── Render ─────────────────────────────────────────────────────
  const loading = !atLimit && (eligibility.isPending || !restored)
  const showPreview = showWizard && step !== "review"
  const createLabel = done
    ? createPhaseLabel.opening
    : create.isPending && create.phase
      ? createPhaseLabel[create.phase]
      : "Create page"
  const showSkip = step === "location" && !draft.city && draft.sportIds.length === 0

  return (
    <div className={styles.screen} ref={screenRef}>
      <div className={`${styles.layout} ${showPreview ? styles.layoutWithPreview : ""}`}>
        <section className={styles.card} aria-labelledby="org-create-title">
          <header className={styles.head}>
            <div className={styles.headRow}>
              <button
                type="button"
                className={styles.headBack}
                onClick={showWizard ? onBack : leave}
                disabled={busy}
                aria-label="Back"
              >
                <Icon icon="mdi:arrow-left" width={22} height={22} aria-hidden="true" />
              </button>
              <div className={styles.titles}>
                <h1 id="org-create-title" className={styles.title}>Create a page</h1>
                {showWizard && (
                  <p className={styles.stepCount}>
                    Step {index + 1} of {CREATE_STEPS.length}
                  </p>
                )}
              </div>
            </div>
            {showWizard && (
              <>
                <div className={styles.progress} aria-hidden="true">
                  <span
                    className={styles.progressFill}
                    style={{ width: `${((index + 1) / CREATE_STEPS.length) * 100}%` }}
                  />
                </div>
                <div className={styles.stepper}>
                  <CreateStepper current={step} />
                </div>
              </>
            )}
          </header>

          <div className={styles.body}>
            {loading ? (
              <div className={styles.skeleton} aria-busy="true" aria-label="Loading">
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
                <span className={styles.skeletonBlock} />
                <span className={styles.skeletonBlock} />
              </div>
            ) : atLimit ? (
              <CreateLimitState
                limit={eligibility.data?.limit ?? 3}
                organizations={organizations}
                onOpen={openOrganization}
              />
            ) : step === "type" ? (
              <TypeStep
                value={draft.type}
                onChange={(type) => update({ type })}
                headingRef={headingRef}
              />
            ) : step === "basics" ? (
              <BasicsStep
                draft={draft}
                errors={errors}
                onName={onName}
                onHandle={onHandle}
                onChange={update}
                onBlurField={onBlurField}
                handleStatus={handleCheck.status}
                onUseSuggestion={onUseSuggestion}
                siteHost={siteHost()}
                logo={logo}
                cover={cover}
                onPhoto={onPhoto}
                headingRef={headingRef}
                disabled={busy}
              />
            ) : step === "location" ? (
              <LocationSportsStep
                draft={draft}
                errors={errors}
                onChange={update}
                onBlurField={onBlurField}
                placeBias={placeBias}
                sports={sports}
                sportsLoading={sportsQuery.isPending}
                sportsError={sportsQuery.isError}
                onRetrySports={() => void sportsQuery.refetch()}
                headingRef={headingRef}
                disabled={busy}
              />
            ) : (
              <ReviewStep
                draft={draft}
                logoUrl={logo?.url}
                coverUrl={cover?.url}
                sports={sports}
                onEdit={goTo}
                headingRef={headingRef}
                disabled={busy}
              />
            )}
          </div>

          {showWizard && !loading && (
            <div className={styles.footer}>
              {submitError && (
                <p className={styles.submitError} role="alert">
                  <Icon icon="mdi:alert-circle-outline" width={16} height={16} aria-hidden="true" />
                  {submitError}
                </p>
              )}
              <div className={styles.footerRow}>
                {step !== "type" && (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.footerBack}
                    onClick={onBack}
                    disabled={busy}
                  >
                    Back
                  </Button>
                )}
                <div className={styles.footerEnd}>
                  {showSkip && (
                    <button
                      type="button"
                      className={styles.skip}
                      onClick={() => goTo("review")}
                      disabled={busy}
                    >
                      Skip for now
                    </button>
                  )}
                  {step !== "review" ? (
                    <Button
                      type="button"
                      variant="brand"
                      className={styles.primary}
                      onClick={() => void onContinue()}
                      disabled={step === "type" && !draft.type}
                      loading={continuing}
                      rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="brand"
                      className={styles.primary}
                      onClick={() => void onCreate()}
                      loading={busy}
                    >
                      {createLabel}
                    </Button>
                  )}
                </div>
              </div>
              {step === "review" && (
                <p className={styles.note}>You can change all of this later from your page.</p>
              )}
            </div>
          )}
        </section>

        {showPreview && (
          // A mirror of the form for sighted desktop users; the form itself
          // is the accessible version, so this is hidden from assistive tech.
          <aside className={styles.previewCol} aria-hidden="true">
            <p className={styles.previewLabel}>Preview</p>
            <PagePreview
              draft={draft}
              logoUrl={logo?.url}
              coverUrl={cover?.url}
              sports={sports}
              compact
            />
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="Discard this page?"
        message="What you've entered so far won't be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={onConfirmDiscard}
        onCancel={onKeepEditing}
      />
    </div>
  )
}
