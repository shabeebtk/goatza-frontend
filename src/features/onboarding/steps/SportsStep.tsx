"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { Button, Input } from "@/shared/components/ui"
import { useSportsList, useMyUserSports, useUpdateUserSport } from "@/features/profile/hooks/useSportsQueries"
import type { Sport, UserSport, SportAttributePayload } from "@/features/profile/services/sports.api"
import { useOnboardingStore } from "../store/onboarding.store"
import StepScaffold from "./StepScaffold"
import modal from "../components/OnboardingModal.module.css"
import styles from "./SportsStep.module.css"

// Draft persisted between steps (in-memory store) — Maps serialised to entry arrays.
type SportsDraft = {
  activeSportId: string | null
  positions: [string, boolean][]
  attrs: [string, string][]
  experienceLevel: string
}

function findFootball(sports: Sport[]): Sport | undefined {
  return sports.find((s) => s.name.toLowerCase() === "football") ?? sports[0]
}

// Map an existing UserSport (names) back onto the master sport's ids (mirrors
// UserSportsEditModal's prefill).
function deriveFromUserSport(us: UserSport, sport: Sport) {
  const positions = new Map<string, boolean>()
  us.positions.forEach(({ position, is_primary }) => {
    const found = sport.positions.find((p) => p.name === position)
    if (found) positions.set(found.id, is_primary)
  })
  const attrs = new Map<string, string>()
  us.attributes.forEach(({ attribute, value }) => {
    const found = sport.attributes.find((a) => a.name === attribute)
    if (found) attrs.set(found.id, value)
  })
  return { positions, attrs }
}

/**
 * Step 3 — Sports, positions & attributes (player branch only). Single sport,
 * saved as the user's primary. Football is preselected. Everything is optional and
 * the whole step is skippable.
 */
export default function SportsStep({ onNext }: { onNext: () => void }) {
  const { data: sports, isLoading: sportsLoading } = useSportsList()
  const draft = useOnboardingStore((s) => s.drafts.sports) as SportsDraft | undefined
  // Only need the user's existing sports for the very first entry (no draft yet).
  const { data: userSports, isLoading: userSportsLoading } = useMyUserSports()

  const waiting = sportsLoading || (!draft && userSportsLoading)

  if (waiting || !sports) {
    return (
      <div className={modal.stepScaffold}>
        <div className={`${modal.stepBody} ${styles.loadingBody}`}>
          <span className={styles.miniSpinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading sports…</span>
        </div>
      </div>
    )
  }

  return (
    <SportsForm
      sports={sports}
      userSports={userSports ?? []}
      draft={draft}
      onNext={onNext}
    />
  )
}

function SportsForm({
  sports,
  userSports,
  draft,
  onNext,
}: {
  sports: Sport[]
  userSports: UserSport[]
  draft?: SportsDraft
  onNext: () => void
}) {
  const setDraft = useOnboardingStore((s) => s.setDraft)
  const updateSport = useUpdateUserSport()

  // ── Initial state: draft → existing user sport → football default ──
  // Computed once (Maps are expensive to rebuild every render).
  const initRef = useRef<{
    activeSportId: string | null
    positions: Map<string, boolean>
    attrs: Map<string, string>
    experienceLevel: string
  } | null>(null)
  if (!initRef.current) {
    if (draft) {
      initRef.current = {
        activeSportId: draft.activeSportId,
        positions: new Map(draft.positions),
        attrs: new Map(draft.attrs),
        experienceLevel: draft.experienceLevel,
      }
    } else if (userSports.length > 0) {
      const primary = userSports.find((s) => s.is_primary) ?? userSports[0]
      const master = sports.find((s) => s.id === primary.sport.id)
      if (master) {
        const { positions, attrs } = deriveFromUserSport(primary, master)
        initRef.current = {
          activeSportId: master.id,
          positions,
          attrs,
          experienceLevel: primary.experience_level ?? "",
        }
      }
    }
    initRef.current ??= {
      activeSportId: findFootball(sports)?.id ?? null,
      positions: new Map<string, boolean>(),
      attrs: new Map<string, string>(),
      experienceLevel: "",
    }
  }
  const init = initRef.current

  const [activeSportId, setActiveSportId] = useState<string | null>(init.activeSportId)
  const [selectedPositions, setSelectedPositions] = useState<Map<string, boolean>>(init.positions)
  const [attrValues, setAttrValues] = useState<Map<string, string>>(init.attrs)
  const [experienceLevel, setExperienceLevel] = useState<string>(init.experienceLevel)
  const [pendingSport, setPendingSport] = useState<Sport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeSport = sports.find((s) => s.id === activeSportId) ?? null

  // ── Persist draft on unmount (Back/forward keeps selections) ──
  const latestRef = useRef<SportsDraft>({
    activeSportId,
    positions: Array.from(selectedPositions.entries()),
    attrs: Array.from(attrValues.entries()),
    experienceLevel,
  })
  latestRef.current = {
    activeSportId,
    positions: Array.from(selectedPositions.entries()),
    attrs: Array.from(attrValues.entries()),
    experienceLevel,
  }
  useEffect(() => {
    return () => setDraft("sports", latestRef.current)
  }, [setDraft])

  // ── Sport switching (confirm only when there's something to lose) ──
  const applySport = (s: Sport) => {
    setActiveSportId(s.id)
    setSelectedPositions(new Map())
    setAttrValues(new Map())
    setExperienceLevel("")
    setPendingSport(null)
    setError(null)
  }

  const requestSelectSport = (s: Sport) => {
    if (s.id === activeSportId) return
    const hasSelections = selectedPositions.size > 0 || attrValues.size > 0
    if (hasSelections) setPendingSport(s)
    else applySport(s)
  }

  // ── Positions (first selected → primary; ★ re-assigns primary) ──
  const togglePosition = (posId: string) => {
    setSelectedPositions((prev) => {
      const next = new Map(prev)
      if (next.has(posId)) {
        next.delete(posId)
        if (next.size > 0 && !Array.from(next.values()).some(Boolean)) {
          const firstKey = next.keys().next().value
          if (firstKey) next.set(firstKey, true)
        }
      } else {
        next.set(posId, next.size === 0)
      }
      return next
    })
  }

  const setPrimaryPosition = (posId: string) => {
    setSelectedPositions((prev) => {
      const next = new Map(prev)
      next.forEach((_, k) => next.set(k, k === posId))
      return next
    })
  }

  // ── Attributes ──
  const setAttr = (attrId: string, value: string) => {
    setAttrValues((prev) => {
      const next = new Map(prev)
      if (value === "") next.delete(attrId)
      else next.set(attrId, value)
      return next
    })
  }

  const toggleMultiAttr = (attrId: string, optionValue: string) => {
    setAttrValues((prev) => {
      const next = new Map(prev)
      const cur = next.get(attrId) ?? ""
      const parts = cur ? cur.split(",") : []
      const idx = parts.indexOf(optionValue)
      if (idx >= 0) parts.splice(idx, 1)
      else parts.push(optionValue)
      if (parts.length === 0) next.delete(attrId)
      else next.set(attrId, parts.join(","))
      return next
    })
  }

  // ── Save / skip ──
  const buildPayload = () => {
    if (!activeSport) return null

    const positions = Array.from(selectedPositions.entries()).map(
      ([position_id, is_primary]) => ({ position_id, is_primary })
    )

    const attributes: SportAttributePayload[] = []
    attrValues.forEach((val, attrId) => {
      const attrDef = activeSport.attributes.find((a) => a.id === attrId)
      if (!attrDef) return
      if (attrDef.data_type === "select") {
        const opt = attrDef.options.find((o) => o.value === val)
        if (opt) attributes.push({ attribute_id: attrId, option_id: opt.id })
      } else {
        // multi_select (comma-joined) + text/number all key on value_text.
        attributes.push({ attribute_id: attrId, value_text: val })
      }
    })

    return {
      sport_id: activeSport.id,
      is_primary: true, // single onboarding sport is always the primary
      experience_level: experienceLevel,
      positions,
      attributes,
    }
  }

  const handleContinue = async () => {
    setError(null)
    const payload = buildPayload()
    if (!payload) {
      onNext()
      return
    }
    try {
      await updateSport.mutateAsync(payload)
      onNext()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object"
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setError(msg ?? "Couldn't save your sport. Please try again.")
    }
  }

  const busy = updateSport.isPending

  const sortedAttributes = activeSport
    ? activeSport.attributes.slice().sort((a, b) => a.display_order - b.display_order)
    : []

  return (
    <StepScaffold
      icon="mdi:soccer"
      title="Your sport"
      subtitle="Pick your main sport, then add positions and details. All optional."
      footer={
        <div className={styles.footerCol}>
          <Button
            variant="brand"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!activeSport}
            onClick={handleContinue}
          >
            Continue →
          </Button>
          <button
            type="button"
            className={styles.skipLink}
            onClick={onNext}
            disabled={busy}
          >
            Skip for now
          </button>
        </div>
      }
    >
      {/* ── Sport selector ── */}
      <div className={styles.sportRow} role="group" aria-label="Select your sport">
        {sports.map((s) => {
          const activeSel = s.id === activeSportId
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={activeSel}
              className={`${styles.sportChip} ${activeSel ? styles.sportChipOn : ""}`}
              onClick={() => requestSelectSport(s)}
            >
              {s.icon_name && (
                <Icon icon={s.icon_name} width={22} height={22} aria-hidden="true" />
              )}
              <span>{s.name}</span>
            </button>
          )
        })}
      </div>

      {/* ── Switch confirm (only when there's something to lose) ── */}
      {pendingSport && (
        <div className={styles.confirm} role="alertdialog" aria-label="Change sport">
          <p className={styles.confirmText}>
            Changing sport resets your positions &amp; attributes.
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmGhost}
              onClick={() => setPendingSport(null)}
            >
              Keep {activeSport?.name}
            </button>
            <button
              type="button"
              className={styles.confirmPrimary}
              onClick={() => applySport(pendingSport)}
            >
              Change sport
            </button>
          </div>
        </div>
      )}

      {activeSport && (
        <>
          {/* ── Positions ── */}
          {activeSport.positions.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>
                Positions
                <span className={styles.groupHint}>tap to select · ★ sets primary</span>
              </p>
              <div className={styles.chipWrap}>
                {activeSport.positions.map((pos) => {
                  const isSelected = selectedPositions.has(pos.id)
                  const isPrimary = selectedPositions.get(pos.id) === true
                  return (
                    <div
                      key={pos.id}
                      className={`${styles.posChip} ${isSelected ? styles.posChipOn : ""} ${
                        isPrimary ? styles.posChipPrimary : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.posChipName}
                        onClick={() => togglePosition(pos.id)}
                        aria-pressed={isSelected}
                      >
                        {pos.name}
                      </button>
                      {isSelected && (
                        <>
                          {isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                          <button
                            type="button"
                            className={styles.posChipStar}
                            onClick={() => setPrimaryPosition(pos.id)}
                            aria-label={`Set ${pos.name} as primary position`}
                          >
                            <Icon
                              icon={isPrimary ? "mdi:star" : "mdi:star-outline"}
                              width={13}
                              height={13}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Attributes ── */}
          {sortedAttributes.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Attributes</p>
              <div className={styles.attrList}>
                {sortedAttributes.map((attr) => {
                  const curVal = attrValues.get(attr.id) ?? ""
                  return (
                    <div key={attr.id} className={styles.attrRow}>
                      <p className={styles.attrName}>{attr.name}</p>

                      {attr.data_type === "select" && (
                        <div className={styles.chipWrap}>
                          {attr.options.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`${styles.attrChip} ${
                                curVal === opt.value ? styles.attrChipOn : ""
                              }`}
                              onClick={() =>
                                setAttr(attr.id, curVal === opt.value ? "" : opt.value)
                              }
                            >
                              {opt.value}
                            </button>
                          ))}
                        </div>
                      )}

                      {attr.data_type === "multi_select" && (
                        <div className={styles.chipWrap}>
                          {attr.options.map((opt) => {
                            const selected = curVal.split(",").includes(opt.value)
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`${styles.attrChip} ${
                                  selected ? styles.attrChipOn : ""
                                }`}
                                onClick={() => toggleMultiAttr(attr.id, opt.value)}
                              >
                                {opt.value}
                                {selected && (
                                  <Icon icon="mdi:check" width={11} height={11} aria-hidden="true" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {(attr.data_type === "text" || attr.data_type === "number") && (
                        <Input
                          type={attr.data_type === "number" ? "number" : "text"}
                          value={curVal}
                          onChange={(e) => setAttr(attr.id, e.target.value)}
                          placeholder={attr.name}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className={modal.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {error}
        </p>
      )}
    </StepScaffold>
  )
}
