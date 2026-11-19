"use client"

import { useId, useState } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import { READINESS_STEPS } from "../../sectionMeta"
import type { Readiness } from "../../types"
import styles from "./PageHub.module.css"

/**
 * How ready the page is, on the dark CTA surface: the score, ONE next step with
 * its reason, and the whole checklist folded away. At 100% the next step is to
 * share it.
 */
export default function ReadinessCard({
  orgId,
  noun,
  readiness,
  onShare,
}: {
  orgId: string
  noun: string
  readiness: Readiness
  onShare: () => void
}) {
  const [checklistOpen, setChecklistOpen] = useState(false)
  const checklistId = useId()
  const percent = Math.max(0, Math.min(100, Math.round(readiness.percent)))
  const ready = percent >= 100
  const step = readiness.next ? READINESS_STEPS[readiness.next.key] : undefined

  return (
    <section className={styles.readiness} aria-labelledby={`${checklistId}-title`}>
      <h2 id={`${checklistId}-title`} className={styles.readinessTitle}>
        {ready ? "Your page is ready" : `Your page is ${percent}% ready`}
      </h2>

      <div
        className={styles.progress}
        role="progressbar"
        aria-label="How ready your page is"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>

      {ready ? (
        <>
          <p className={styles.readinessText}>
            Everything people look for is on it. Now get it in front of them.
          </p>
          <Button
            variant="brand"
            className={styles.readinessCta}
            leftIcon={<Icon icon="mdi:share-variant-outline" width={18} height={18} />}
            onClick={onShare}
          >
            Share it
          </Button>
        </>
      ) : step ? (
        <>
          <p className={styles.readinessText}>{step.why(noun)}</p>
          <Button
            variant="brand"
            href={step.href(orgId)}
            className={styles.readinessCta}
            rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
          >
            {step.cta}
          </Button>
        </>
      ) : null}

      {readiness.items.length > 0 && (
        <div className={styles.checklist}>
          <button
            type="button"
            className={styles.checklistToggle}
            aria-expanded={checklistOpen}
            aria-controls={checklistId}
            onClick={() => setChecklistOpen((open) => !open)}
          >
            {checklistOpen ? "Hide checklist" : "See checklist"}
            <Icon
              icon={checklistOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
              width={18}
              height={18}
              aria-hidden="true"
            />
          </button>
          <ul id={checklistId} className={styles.checklistItems} hidden={!checklistOpen}>
            {readiness.items.map((item) => (
              <li
                key={item.key}
                className={`${styles.checklistItem} ${item.done ? styles.checklistDone : ""}`}
              >
                <Icon
                  icon={item.done ? "mdi:check-circle" : "mdi:circle-outline"}
                  width={20}
                  height={20}
                  className={styles.checklistIcon}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                <span className={styles.srOnly}>{item.done ? ", done" : ", to do"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
