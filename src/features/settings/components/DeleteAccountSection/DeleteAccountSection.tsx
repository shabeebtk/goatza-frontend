"use client"

/**
 * The danger zone — the last thing on the settings page, under even the log-out
 * card.
 *
 * Built from SettingsSection's grammar (uppercase muted heading over a card)
 * rather than reusing the component, because this one card has to look
 * different from every other row on the page: a red border, a red label, and
 * the consequence spelled out UNDER the row instead of as a subtitle beside
 * it. A destructive action that looks like "Saved posts" is a destructive
 * action somebody taps by accident.
 *
 * The modal is mounted only while open so that opening it is what fires the
 * initiate call — see DeleteAccountModal for why that matters.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import DeleteAccountModal from "../DeleteAccountModal/DeleteAccountModal"
import styles from "./DeleteAccountSection.module.css"

export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Danger zone</h2>

      <div className={styles.card}>
        <button
          type="button"
          className={styles.row}
          onClick={() => setOpen(true)}
        >
          <span className={styles.rowIcon} aria-hidden="true">
            <Icon icon="mdi:delete-forever-outline" width={20} height={20} />
          </span>
          <span className={styles.rowLabel}>Delete account</span>
          <span className={styles.rowChevron} aria-hidden="true">
            <Icon icon="mdi:chevron-right" width={20} height={20} />
          </span>
        </button>

        <p className={styles.note}>
          Deleting deactivates your account immediately and permanently erases it
          after 30 days.
        </p>
      </div>

      {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
    </section>
  )
}
