"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"
import styles from "../components/OnboardingModal.module.css"

/**
 * Shared layout for every onboarding step: an icon + title + subtitle intro, a
 * scrollable body, and a sticky footer slot for the step's own actions. Keeps the
 * steps visually consistent while each owns its content and navigation logic.
 */
export default function StepScaffold({
  icon,
  title,
  subtitle,
  children,
  footer,
}: {
  icon: string
  title: string
  subtitle?: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className={styles.stepScaffold}>
      <div className={styles.stepBody}>
        <div className={styles.stepIntro}>
          <span className={styles.stepIcon} aria-hidden="true">
            <Icon icon={icon} width={26} height={26} />
          </span>
          <h2 className={styles.stepTitle}>{title}</h2>
          {subtitle && <p className={styles.stepSubtitle}>{subtitle}</p>}
        </div>

        {children}
      </div>

      <div className={styles.stepFooter}>{footer}</div>
    </div>
  )
}
