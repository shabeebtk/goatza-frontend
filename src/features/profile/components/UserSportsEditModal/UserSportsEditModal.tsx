"use client"

/**
 * SportEditModal
 * Add a new sport or edit an existing one.
 *
 * Props:
 *   sport        — the master sport definition (from /sports/list)
 *   existing     — if editing, the user's current UserSport record
 *   onClose      — close the modal
 */

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import {
  useAddUserSport,
  useUpdateUserSport,
} from "@/features/profile/hooks/useSportsQueries"
import type {
  Sport,
  UserSport,
  SportAttributePayload,
} from "@/features/profile/services/sports.api"
import styles from "./SportEditModal.module.css"
import { Input } from "@/shared/components/ui"

// ── Experience level options ──────────────────────────────────

const EXPERIENCE_LEVELS = [
  { value: "beginner",     label: "Beginner"     },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced"     },
  { value: "professional", label: "Professional" },
]

// ── Helpers ───────────────────────────────────────────────────

function getLevelLabel(val: string) {
  return EXPERIENCE_LEVELS.find((l) => l.value === val)?.label ?? val
}

// ── Props ─────────────────────────────────────────────────────

interface SportEditModalProps {
  sport: Sport
  existing?: UserSport        // present when editing, absent when adding
  isPrimaryDisabled?: boolean // prevent un-setting primary if only sport
  onClose: () => void
}

export default function SportEditModal({
  sport,
  existing,
  isPrimaryDisabled = false,
  onClose,
}: SportEditModalProps) {
  const addSport    = useAddUserSport()
  const updateSport = useUpdateUserSport()
  const isEditing   = !!existing

  // ── Local state ───────────────────────────────────────────────

  const [isPrimary, setIsPrimary] = useState(existing?.is_primary ?? false)
  const [level, setLevel]         = useState(existing?.experience_level ?? "beginner")
  const [error, setError]         = useState<string | null>(null)

  // Selected positions: Map<position_id, is_primary>
  const [selectedPositions, setSelectedPositions] = useState<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>()
    if (existing) {
      existing.positions.forEach(({ position, is_primary }) => {
        // Match by name back to id from master sport
        const found = sport.positions.find((p) => p.name === position)
        if (found) map.set(found.id, is_primary)
      })
    }
    return map
  })

  // Attribute values: Map<attribute_id, option_id | value_text>
  const [attrValues, setAttrValues] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>()
    if (existing) {
      existing.attributes.forEach(({ attribute, value }) => {
        const found = sport.attributes.find((a) => a.name === attribute)
        if (found) map.set(found.id, value)
      })
    }
    return map
  })

  // ── Position handlers ─────────────────────────────────────────

  const togglePosition = (posId: string) => {
    setSelectedPositions((prev) => {
      const next = new Map(prev)
      if (next.has(posId)) {
        next.delete(posId)
        // If we deleted the primary, set another as primary
        if (next.size > 0 && !Array.from(next.values()).some(Boolean)) {
          const firstKey = next.keys().next().value
          if (firstKey) next.set(firstKey, true)
        }
      } else {
        // First selected position becomes primary automatically
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

  // ── Attribute handler ─────────────────────────────────────────

  const setAttr = (attrId: string, value: string) => {
    setAttrValues((prev) => {
      const next = new Map(prev)
      if (value === "") next.delete(attrId)
      else next.set(attrId, value)
      return next
    })
  }

  // For multi_select: toggle individual option values as comma-separated
  const toggleMultiAttr = (attrId: string, optionValue: string) => {
    setAttrValues((prev) => {
      const next  = new Map(prev)
      const cur   = next.get(attrId) ?? ""
      const parts = cur ? cur.split(",") : []
      const idx   = parts.indexOf(optionValue)
      if (idx >= 0) parts.splice(idx, 1)
      else parts.push(optionValue)
      if (parts.length === 0) next.delete(attrId)
      else next.set(attrId, parts.join(","))
      return next
    })
  }

  // ── Submit ────────────────────────────────────────────────────

  const handleSave = async () => {
    setError(null)

    // Validate required attributes
    for (const attr of sport.attributes) {
      if (attr.is_required && !attrValues.has(attr.id)) {
        setError(`"${attr.name}" is required.`)
        return
      }
    }

    // Build positions payload
    const positions = Array.from(selectedPositions.entries()).map(
      ([position_id, is_primary]) => ({ position_id, is_primary })
    )

    // Build attributes payload
    const attributes: SportAttributePayload[] = []
    attrValues.forEach((val, attrId) => {
      const attrDef = sport.attributes.find((a) => a.id === attrId)
      if (!attrDef) return

      if (attrDef.data_type === "select") {
        // val is an option value string — need to find the option id
        const opt = attrDef.options.find((o) => o.value === val)
        if (opt) attributes.push({ attribute_id: attrId, option_id: opt.id })
      } else if (attrDef.data_type === "multi_select") {
        // Store as comma-separated text for now
        attributes.push({ attribute_id: attrId, value_text: val })
      } else {
        attributes.push({ attribute_id: attrId, value_text: val })
      }
    })

    const payload = {
      sport_id:         sport.id,
      is_primary:       isPrimary,
      experience_level: level,
      positions,
      attributes,
    }

    try {
      if (isEditing) {
        await updateSport.mutateAsync(payload)
      } else {
        await addSport.mutateAsync(payload)
      }
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object"
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      setError(msg ?? "Something went wrong. Please try again.")
    }
  }

  const isSaving = addSport.isPending || updateSport.isPending

  // SSR-safe portal: wait for client mount before accessing document
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`${isEditing ? "Edit" : "Add"} ${sport.name}`}
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon} aria-hidden="true">
              <Icon icon={sport.icon_name} width={22} height={22} />
            </span>
            <h2 className={styles.headerTitle}>
              {isEditing ? "Edit" : "Add"} {sport.name}
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>

          {/* Primary toggle */}
          <div className={styles.primaryRow}>
            <div className={styles.primaryLabel}>
              <Icon icon="mdi:star-outline" width={15} height={15} />
              Primary Sport
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${isPrimary ? styles.toggleOn : ""}`}
              onClick={() => !isPrimaryDisabled && setIsPrimary((v) => !v)}
              aria-pressed={isPrimary}
              aria-label="Set as primary sport"
              disabled={isPrimaryDisabled && isPrimary}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>

          {/* Experience level */}
          <div className={styles.fieldGroup}>
            <p className={styles.fieldLabel}>Experience Level</p>
            <div className={styles.chipRow}>
              {EXPERIENCE_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  className={`${styles.levelChip} ${level === lvl.value ? styles.levelChipActive : ""}`}
                  onClick={() => setLevel(lvl.value)}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Positions */}
          {sport.positions.length > 0 && (
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>
                Positions
                <span className={styles.fieldHint}>tap to select, ★ to set primary</span>
              </p>
              <div className={styles.positionGrid}>
                {sport.positions.map((pos) => {
                  const isSelected = selectedPositions.has(pos.id)
                  const isPrimPos  = selectedPositions.get(pos.id) === true
                  return (
                    <div
                      key={pos.id}
                      className={`${styles.posChip} ${isSelected ? styles.posChipSelected : ""} ${isPrimPos ? styles.posChipPrimary : ""}`}
                    >
                      <button
                        type="button"
                        className={styles.posChipName}
                        onClick={() => togglePosition(pos.id)}
                      >
                        {pos.name}
                      </button>
                      {isSelected && (
                        <button
                          type="button"
                          className={styles.posChipStar}
                          onClick={() => setPrimaryPosition(pos.id)}
                          aria-label={`Set ${pos.name} as primary`}
                        >
                          <Icon
                            icon={isPrimPos ? "mdi:star" : "mdi:star-outline"}
                            width={12}
                            height={12}
                          />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Dynamic attributes */}
          {sport.attributes.length > 0 && (
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>Attributes</p>
              <div className={styles.attributeList}>
                {sport.attributes
                  .slice()
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((attr) => {
                    const curVal = attrValues.get(attr.id) ?? ""
                    return (
                      <div key={attr.id} className={styles.attrRow}>
                        <p className={styles.attrName}>
                          {attr.name}
                          {attr.is_required && (
                            <span className={styles.attrRequired} aria-hidden="true">*</span>
                          )}
                        </p>

                        {attr.data_type === "select" && (
                          <div className={styles.chipRow}>
                            {attr.options.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                className={`${styles.attrChip} ${curVal === opt.value ? styles.attrChipActive : ""}`}
                                onClick={() => setAttr(attr.id, curVal === opt.value ? "" : opt.value)}
                              >
                                {opt.value}
                              </button>
                            ))}
                          </div>
                        )}

                        {attr.data_type === "multi_select" && (
                          <div className={styles.chipRow}>
                            {attr.options.map((opt) => {
                              const selected = curVal.split(",").includes(opt.value)
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  className={`${styles.attrChip} ${selected ? styles.attrChipActive : ""}`}
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

          {error && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
              {error}
            </p>
          )}

        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className={styles.saveBtn} type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><span className={styles.spinner} aria-hidden="true" /> Saving…</>
            ) : (
              isEditing ? "Save Changes" : `Add ${sport.name}`
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}