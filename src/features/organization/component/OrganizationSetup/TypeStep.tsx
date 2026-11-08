"use client"

import { useRef, type KeyboardEvent, type RefObject } from "react"
import { Icon } from "@iconify/react"
import type { OrgType } from "../../types"
import { ORG_TYPE_OPTIONS } from "./createPageDraft"
import { fieldId } from "./CreateField"
import styles from "./TypeStep.module.css"

/**
 * Step 1 — what kind of page. A radiogroup of four cards: one tab stop (the
 * checked card, or the first), arrow keys move AND select like native radios,
 * Space/Enter select. Continue is enabled by the frame once one is picked.
 */
export default function TypeStep({
  value,
  onChange,
  headingRef,
}: {
  value: OrgType | null
  onChange: (type: OrgType) => void
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const selectedIndex = ORG_TYPE_OPTIONS.findIndex((option) => option.type === value)
  const tabIndexFor = (index: number) =>
    (selectedIndex === -1 ? index === 0 : index === selectedIndex) ? 0 : -1

  const move = (from: number, delta: number) => {
    const count = ORG_TYPE_OPTIONS.length
    const next = (from + delta + count) % count
    onChange(ORG_TYPE_OPTIONS[next].type)
    cardRefs.current[next]?.focus()
  }

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault()
        move(index, 1)
        break
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault()
        move(index, -1)
        break
      case "Home":
        event.preventDefault()
        move(0, 0)
        break
      case "End":
        event.preventDefault()
        move(ORG_TYPE_OPTIONS.length - 1, 0)
        break
      case " ":
      case "Enter":
        event.preventDefault()
        onChange(ORG_TYPE_OPTIONS[index].type)
        break
    }
  }

  return (
    <section className={styles.step} aria-labelledby="org-create-type-heading">
      <h2
        id="org-create-type-heading"
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
      >
        What kind of page?
      </h2>
      <p className={styles.lead}>Pick the one that fits best. You can change it later.</p>

      <div
        id={fieldId("type")}
        role="radiogroup"
        aria-labelledby="org-create-type-heading"
        className={styles.grid}
      >
        {ORG_TYPE_OPTIONS.map((option, index) => {
          const checked = option.type === value
          return (
            <div
              key={option.type}
              ref={(node) => { cardRefs.current[index] = node }}
              role="radio"
              aria-checked={checked}
              aria-describedby={`org-create-type-${option.type}-desc`}
              tabIndex={tabIndexFor(index)}
              className={`${styles.card} ${checked ? styles.cardChecked : ""}`}
              onClick={() => onChange(option.type)}
              onKeyDown={onKeyDown(index)}
            >
              <span className={styles.icon} aria-hidden="true">
                <Icon icon={option.icon} width={26} height={26} />
              </span>
              <span className={styles.body}>
                <span className={styles.label}>{option.label}</span>
                <span id={`org-create-type-${option.type}-desc`} className={styles.desc}>
                  {option.description}
                  <span className={styles.examples}>{option.examples}</span>
                </span>
              </span>
              <span className={styles.check} aria-hidden="true">
                <Icon icon={checked ? "mdi:check-circle" : "mdi:circle-outline"} width={22} height={22} />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
