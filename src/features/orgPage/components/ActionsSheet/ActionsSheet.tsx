"use client"

import { Icon } from "@iconify/react"

import { whenHistorySettled } from "@/shared/hooks/useBackToClose"
import PageSheet from "../PageSheet/PageSheet"
import styles from "./ActionsSheet.module.css"

export type SheetAction = {
  id: string
  label: string
  icon: string
  tone?: "danger"
  disabled?: boolean
  onSelect: () => void
}

/**
 * A ⋯ menu: a short list of actions on a PageSheet. The sheet closes first and the
 * action runs once history has settled (whenHistorySettled), so a ConfirmDialog
 * or another sheet it opens never sits on a dead history entry.
 */
export default function ActionsSheet({
  title,
  actions,
  onClose,
}: {
  title: string
  actions: SheetAction[]
  onClose: () => void
}) {
  return (
    <PageSheet title={title} onClose={onClose}>
      {(close) => (
        <ul className={styles.list}>
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className={`${styles.action} ${action.tone === "danger" ? styles.danger : ""}`}
                disabled={action.disabled}
                onClick={() => {
                  close()
                  whenHistorySettled(action.onSelect)
                }}
              >
                <Icon icon={action.icon} width={22} height={22} aria-hidden="true" />
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageSheet>
  )
}
