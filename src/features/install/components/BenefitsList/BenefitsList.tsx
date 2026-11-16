import { Icon } from "@iconify/react"
import { BENEFITS, type Benefit } from "../../installCopy"
import styles from "./BenefitsList.module.css"

/**
 * Why install, as icon rows. `tone="poster"` is light text for the always-dark
 * install page; `tone="theme"` follows the app's theme (the landing page).
 */
export default function BenefitsList({
  items = BENEFITS,
  tone = "poster",
  className,
}: {
  items?: readonly Benefit[]
  tone?: "poster" | "theme"
  className?: string
}) {
  return (
    <ul className={`${styles.list} ${styles[tone]} ${className ?? ""}`}>
      {items.map((item) => (
        <li key={item.title} className={styles.row}>
          <span className={styles.icon} aria-hidden="true">
            <Icon icon={item.icon} width={20} height={20} />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{item.title}</span>
            {item.text && <span className={styles.sub}>{item.text}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
