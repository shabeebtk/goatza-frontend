import { Icon } from "@iconify/react"

import { GUARDIAN_DATA_LIST, WHAT_GOATZA_IS } from "../../guardianCopy"
import styles from "./GuardianDataList.module.css"

/**
 * "Here is what Goatza is, and here is what we hold." The same block on the
 * hand-the-phone step and on the emailed consent page, because a parent who
 * sees one of those screens and later sees the other must not find the answer
 * has changed.
 *
 * `items` exists for one caller: the public consent page, which is handed a
 * `data_list` by the server and should show THAT rather than a client-side
 * constant — the server's list is the one tied to the notice the parent is
 * agreeing to. Everywhere else falls through to the local copy, which is what
 * the signup flow uses because it has no notice to be tied to yet.
 */
export default function GuardianDataList({
  items,
}: {
  items?: readonly string[]
}) {
  const lines = items?.length ? items : GUARDIAN_DATA_LIST

  return (
    <div className={styles.block}>
      <p className={styles.intro}>{WHAT_GOATZA_IS}</p>

      <p className={styles.listLabel}>What we keep about them:</p>

      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line} className={styles.item}>
            <Icon
              icon="mdi:check-circle-outline"
              className={styles.itemIcon}
              width={16}
              height={16}
              aria-hidden="true"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
