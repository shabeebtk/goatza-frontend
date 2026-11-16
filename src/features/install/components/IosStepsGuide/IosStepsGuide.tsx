"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { IOS_COPY, type IosStep, type IosStepArt } from "../../installCopy"
import styles from "./IosStepsGuide.module.css"

/** Which toolbar the step-1 arrow points at, or none (Chrome's bar is at the top). */
export type IosArrow = "modern" | "classic" | null

/**
 * The thing to tap, drawn large on the card. Decorative: the step's title
 * already says it in words.
 */
function StepArt({ art }: { art: IosStepArt }) {
  switch (art) {
    case "more":
      return (
        <span className={styles.roundKey}>
          <Icon icon="mdi:dots-horizontal" width={34} height={34} />
        </span>
      )
    case "share":
      return (
        <span className={styles.squareKey}>
          <Icon icon="mdi:export-variant" width={32} height={32} />
        </span>
      )
    case "addToHome":
      return (
        <span className={styles.menuRow}>
          <span>Add to Home Screen</span>
          <Icon icon="mdi:plus-box-outline" width={24} height={24} />
        </span>
      )
    case "webApp":
      return (
        <span className={styles.addSheet}>
          <span className={styles.addSheetBar}>
            <span className={styles.muted}>Cancel</span>
            <span className={styles.addAction}>Add</span>
          </span>
          <span className={styles.menuRow}>
            <span>Open as Web App</span>
            <span className={styles.switchOn} />
          </span>
        </span>
      )
    case "add":
      return (
        <span className={styles.addSheet}>
          <span className={styles.addSheetBar}>
            <span className={styles.muted}>Cancel</span>
            <span className={styles.addAction}>Add</span>
          </span>
        </span>
      )
    case "chromeShare":
      return (
        <span className={styles.addressBar}>
          <span className={styles.addressText}>goatza.com</span>
          <Icon icon="mdi:export-variant" width={22} height={22} />
        </span>
      )
  }
}

/** The same thing, small, at the end of a compact row. */
function StepKey({ art }: { art: IosStepArt }) {
  switch (art) {
    case "more":
      return <Icon icon="mdi:dots-horizontal" width={22} height={22} />
    case "share":
    case "chromeShare":
      return <Icon icon="mdi:export-variant" width={20} height={20} />
    case "addToHome":
      return <Icon icon="mdi:plus-box-outline" width={20} height={20} />
    case "webApp":
      return <span className={styles.switchOnSmall} />
    case "add":
      return <span className={styles.addText}>Add</span>
  }
}

function ToolbarArrow({ arrow }: { arrow: Exclude<IosArrow, null> }) {
  return (
    <Portal>
      <div
        className={`${styles.arrow} ${arrow === "modern" ? styles.arrowRight : styles.arrowCentre}`}
        aria-hidden="true"
      >
        <span className={styles.arrowLabel}>
          {arrow === "modern" ? IOS_COPY.arrowModern : IOS_COPY.arrowClassic}
        </span>
        <Icon icon="mdi:arrow-down-thick" width={28} height={28} />
      </div>
    </Portal>
  )
}

/**
 * The three taps to add Goatza to an iPhone's Home Screen.
 *
 * `variant="card"` (the /install page): one step at a time, a large picture of
 * what to tap, progress dots, Back / Next / Done, the change announced through
 * aria-live. On step 1 `arrow` adds a bouncing pointer at Safari's toolbar.
 * Always dark, like the page.
 *
 * `variant="list"` (the feed banner's sheet): the three steps as compact rows
 * with the key on the right, on the theme's own surface.
 */
export default function IosStepsGuide({
  steps,
  variant = "card",
  arrow = null,
  onDone,
}: {
  steps: readonly IosStep[]
  variant?: "card" | "list"
  arrow?: IosArrow
  onDone?: () => void
}) {
  const [index, setIndex] = useState(0)

  if (variant === "list") {
    return (
      <ol className={styles.list}>
        {steps.map((step, position) => (
          <li key={step.title} className={styles.listRow}>
            <span className={styles.listNumber} aria-hidden="true">
              {position + 1}
            </span>
            <span className={styles.listText}>
              <span className={styles.listTitle}>{step.title}</span>
              <span className={styles.listHelp}>{step.help}</span>
            </span>
            <span className={styles.listKey} aria-hidden="true">
              <StepKey art={step.art} />
            </span>
          </li>
        ))}
      </ol>
    )
  }

  const step = steps[index]
  const last = index === steps.length - 1

  return (
    <div className={styles.card}>
      <div aria-live="polite" className={styles.cardLive}>
        <p className={styles.stepOf}>{IOS_COPY.stepOf(index + 1, steps.length)}</p>
        <div className={styles.art} aria-hidden="true">
          <StepArt art={step.art} />
        </div>
        <h2 className={styles.stepTitle}>{step.title}</h2>
        <p className={styles.stepHelp}>{step.help}</p>
      </div>

      <div className={styles.dots} aria-hidden="true">
        {steps.map((s, position) => (
          <span
            key={s.title}
            className={`${styles.dot} ${position === index ? styles.dotActive : ""}`}
          />
        ))}
      </div>

      <div className={styles.nav}>
        <button
          type="button"
          className={styles.back}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
        >
          {IOS_COPY.back}
        </button>
        <button
          type="button"
          className={styles.next}
          onClick={() => (last ? onDone?.() : setIndex((current) => current + 1))}
        >
          {last ? IOS_COPY.done : IOS_COPY.next}
        </button>
      </div>

      {arrow && index === 0 && <ToolbarArrow arrow={arrow} />}
    </div>
  )
}
