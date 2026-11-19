"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import { FieldError } from "../PageFields/PageFields"
import fieldStyles from "../PageFields/PageFields.module.css"
import styles from "./AboutFactsPage.module.css"

export const MAX_LANGUAGES = 6
export const LANGUAGE_MAX_LENGTH = 30
const QUICK_LANGUAGES = ["Malayalam", "English", "Hindi", "Tamil", "Kannada", "Arabic"]

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

/** `languages` plus whatever `raw` names ("Tamil, Urdu"), without repeats, at most six. */
export function withLanguages(languages: string[], raw: string): string[] {
  const out = [...languages]
  for (const part of raw.split(",")) {
    const language = part.trim().replace(/\s+/g, " ").slice(0, LANGUAGE_MAX_LENGTH)
    if (!language || out.some((existing) => same(existing, language))) continue
    if (out.length >= MAX_LANGUAGES) break
    out.push(language)
  }
  return out
}

/**
 * Coaching languages as chips: type and press Enter (or a comma) to add, × to
 * remove, up to six, with the common ones one tap away. A comma is handled where
 * the text changes, not on the key, because Android keyboards don't name the key.
 */
export default function LanguageField({
  id,
  languages,
  onChange,
  error,
}: {
  id: string
  languages: string[]
  onChange: (next: string[]) => void
  error?: string
}) {
  const [draft, setDraft] = useState("")
  const full = languages.length >= MAX_LANGUAGES
  const quick = QUICK_LANGUAGES.filter((option) => !languages.some((language) => same(language, option)))
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const add = (raw: string) => {
    const next = withLanguages(languages, raw)
    if (next.length !== languages.length) onChange(next)
  }

  return (
    <div className={fieldStyles.field}>
      <div className={fieldStyles.labelRow}>
        <label htmlFor={id} className={fieldStyles.label}>
          Coaching languages
        </label>
        <span className={styles.counter} aria-hidden="true">
          {languages.length} / {MAX_LANGUAGES}
        </span>
      </div>

      <div className={`${styles.chipInput} ${error ? styles.chipInputInvalid : ""}`}>
        {languages.length > 0 && (
          <ul className={styles.chipList} aria-label="Languages added">
            {languages.map((language) => (
              <li key={language} className={styles.chip}>
                <span>{language}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${language}`}
                  onClick={() => onChange(languages.filter((existing) => existing !== language))}
                >
                  <Icon icon="mdi:close" width={14} height={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          className={styles.chipText}
          value={draft}
          disabled={full}
          maxLength={LANGUAGE_MAX_LENGTH + 1}
          placeholder={full ? "" : languages.length ? "Add another" : "Type a language"}
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errorId : "", hintId].filter(Boolean).join(" ")}
          onChange={(event) => {
            const value = event.target.value
            if (value.includes(",")) {
              const cut = value.lastIndexOf(",")
              add(value.slice(0, cut))
              setDraft(value.slice(cut + 1).trimStart())
            } else {
              setDraft(value)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Enter adds the language; it never saves the form.
              event.preventDefault()
              add(draft)
              setDraft("")
            }
          }}
          onBlur={() => {
            if (!draft.trim()) return
            add(draft)
            setDraft("")
          }}
        />
      </div>

      {error && <FieldError id={errorId}>{error}</FieldError>}
      <p id={hintId} className={fieldStyles.hint}>
        {full ? `That's the most: ${MAX_LANGUAGES} languages.` : "Press Enter or type a comma to add one."}
      </p>

      {!full && quick.length > 0 && (
        <div className={styles.quickRow}>
          {quick.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.quickChip}
              aria-label={`Add ${option}`}
              onClick={() => add(option)}
            >
              <Icon icon="mdi:plus" width={14} height={14} aria-hidden="true" />
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
