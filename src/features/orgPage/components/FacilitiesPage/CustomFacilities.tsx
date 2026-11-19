"use client"

import { useId, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { MAX_CUSTOM_FACILITIES } from "../../hooks/useFacilities"
import { FieldError } from "../PageFields/PageFields"
import styles from "./FacilitiesPage.module.css"

const MIN = 2
const MAX = 40

/**
 * The club's own words, for what the catalog doesn't name: chips in the catalog's
 * style with ×, and "+ Add your own", which opens an inline input (Enter adds).
 */
export default function CustomFacilities({
  items,
  onChange,
  error,
}: {
  items: string[]
  onChange: (next: string[]) => void
  error?: string
}) {
  const ids = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [problem, setProblem] = useState("")
  const full = items.length >= MAX_CUSTOM_FACILITIES

  const add = () => {
    const text = draft.trim().replace(/\s+/g, " ")
    if (text.length < MIN || text.length > MAX) {
      setProblem(`Use ${MIN} to ${MAX} characters.`)
      return
    }
    if (items.some((item) => item.toLocaleLowerCase() === text.toLocaleLowerCase())) {
      setProblem("That's already on the list.")
      return
    }
    onChange([...items, text])
    setDraft("")
    setProblem("")
    if (items.length + 1 >= MAX_CUSTOM_FACILITIES) setAdding(false)
    else inputRef.current?.focus()
  }

  return (
    <section className={styles.group} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className={styles.groupTitle}>
        Your own
      </h2>

      {items.length > 0 && (
        <ul className={styles.chips} aria-label="Your own facilities">
          {items.map((item) => (
            <li key={item} className={`${styles.chip} ${styles.chipOn} ${styles.ownChip}`}>
              <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />
              <span>{item}</span>
              <button
                type="button"
                className={styles.ownRemove}
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((existing) => existing !== item))}
              >
                <Icon icon="mdi:close" width={14} height={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && !full ? (
        <div className={styles.ownForm}>
          <label htmlFor={`${ids}-input`} className={styles.srOnly}>
            A facility in your own words
          </label>
          <input
            ref={inputRef}
            id={`${ids}-input`}
            className={styles.ownInput}
            value={draft}
            maxLength={MAX}
            placeholder="e.g. Floodlit futsal court"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${ids}-problem` : undefined}
            onChange={(event) => {
              setDraft(event.target.value)
              if (problem) setProblem("")
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter adds the words; it never saves the form.
                event.preventDefault()
                add()
              } else if (event.key === "Escape") {
                setAdding(false)
                setDraft("")
                setProblem("")
              }
            }}
          />
          <button type="button" className={styles.ownAdd} onClick={add}>
            Add
          </button>
          <button
            type="button"
            className={styles.ownCancel}
            aria-label="Stop adding"
            onClick={() => {
              setAdding(false)
              setDraft("")
              setProblem("")
            }}
          >
            <Icon icon="mdi:close" width={18} height={18} aria-hidden="true" />
          </button>
        </div>
      ) : !full ? (
        <button type="button" className={styles.addOwn} onClick={() => setAdding(true)}>
          <Icon icon="mdi:plus" width={18} height={18} aria-hidden="true" />
          Add your own
        </button>
      ) : (
        <p className={styles.hint}>Up to {MAX_CUSTOM_FACILITIES} of your own.</p>
      )}

      {problem && <FieldError id={`${ids}-problem`}>{problem}</FieldError>}
      {error && <FieldError>{error}</FieldError>}
    </section>
  )
}
