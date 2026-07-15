"use client"

/**
 * ComingSoonHub — placeholder shell for hub features that are not built yet
 * (e.g. /coaching, /scouting). Mirrors the recruitments hub page layout:
 * a display-font header + a centered "coming soon" card describing what the
 * hub will contain. Fully responsive; no feature-specific logic.
 */

import { Icon } from "@iconify/react"
import Card from "@/shared/components/ui/Card/Card"
import styles from "./ComingSoonHub.module.css"

export interface ComingSoonHubProps {
  /** Page + card heading, e.g. "Coaching". */
  title: string
  /** One-line subtitle under the page heading. */
  subtitle: string
  /** Iconify icon representing the hub. */
  icon: string
  /** Short paragraph describing the hub's purpose. */
  description: string
  /** Bullet list of what the hub will contain. */
  features: readonly string[]
}

export default function ComingSoonHub({
  title,
  subtitle,
  icon,
  description,
  features,
}: ComingSoonHubProps) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>

      <Card className={styles.card}>
        <span className={styles.badge}>Coming soon</span>

        <div className={styles.iconWrap} aria-hidden="true">
          <Icon icon={icon} width={44} height={44} />
        </div>

        <h2 className={styles.cardTitle}>{title} hub is on the way</h2>
        <p className={styles.cardBody}>{description}</p>

        {features.length > 0 && (
          <ul className={styles.featureList}>
            {features.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                <Icon
                  icon="mdi:check-circle"
                  width={18}
                  height={18}
                  className={styles.featureIcon}
                  aria-hidden="true"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
