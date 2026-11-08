"use client"

import { Icon } from "@iconify/react"
import { CREATE_STEPS, STEP_LABELS, stepIndex, type CreateStep } from "./createPageDraft"
import styles from "./CreateStepper.module.css"

/**
 * The desktop stepper: four labelled dots joined by lines. Labels never wrap
 * and the lines take up the slack, so "Location & sports" fits the card.
 * Not interactive: steps are reached through the footer and Review's Edit
 * links, so nobody can skip past a step that still needs something.
 */
export default function CreateStepper({ current }: { current: CreateStep }) {
  const currentIndex = stepIndex(current)

  return (
    <ol className={styles.stepper} aria-label="Steps">
      {CREATE_STEPS.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li
            key={step}
            className={`${styles.item} ${done ? styles.done : ""} ${active ? styles.active : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {done ? <Icon icon="mdi:check" width={13} height={13} /> : index + 1}
            </span>
            <span className={styles.label}>
              {STEP_LABELS[step]}
              {done && <span className={styles.srOnly}> (done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
