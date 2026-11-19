"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useSmartBack } from "@/shared/hooks/useSmartBack"
import { pageBase } from "../../sectionMeta"
import styles from "./PageEditorLayout.module.css"

export type PageEditorSave = {
  saving: boolean
  /** Called on tap, unless `formId` makes the button submit that form instead. */
  onSave?: () => void
  /** Submit this form, so Enter in one of its fields saves too. */
  formId?: string
  label?: string
}

/**
 * The frame every page editor stands in: a header (back to the hub, the title, an
 * optional action), the content column, and an optional Save bar.
 *
 * - The Save bar is sticky above the mobile dock on a phone and follows it as it
 *   slides (the Toast's offset: `--bottom-nav-h`, `--safe-bottom`,
 *   `--chrome-progress`); from 768px it is a plain footer at the end of the column.
 * - Save shows a spinner while it runs and stays disabled until `dirty`.
 * - With unsaved changes, leaving warns: the browser's own prompt on unload, and
 *   "Discard changes?" on the back button here.
 */
export default function PageEditorLayout({
  orgId,
  title,
  action,
  dirty = false,
  save,
  back,
  wide = false,
  children,
}: {
  orgId: string
  title: string
  /** On the header's right: Preview on the hub, nothing on most editors. */
  action?: ReactNode
  /** Something has changed and is not saved yet. */
  dirty?: boolean
  save?: PageEditorSave
  /** Where back goes when there is no in-app page behind this one. Default: the hub. */
  back?: { fallback: string; label: string }
  /** From 960px, a wider column for an editor with a side panel (the program preview). */
  wide?: boolean
  children: ReactNode
}) {
  const goBack = useSmartBack(back?.fallback ?? pageBase(orgId))
  const [askDiscard, setAskDiscard] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Still what a few browsers need before they show their prompt.
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  return (
    <div className={`${styles.page} ${save ? styles.withSave : ""} ${wide ? styles.wide : ""}`}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => (dirty ? setAskDiscard(true) : goBack())}
          aria-label={back?.label ?? "Back to your page"}
        >
          <Icon icon="mdi:arrow-left" width={22} height={22} aria-hidden="true" />
        </button>
        <h1 className={styles.title}>{title}</h1>
        {action && <div className={styles.action}>{action}</div>}
      </header>

      <div className={styles.content}>{children}</div>

      {save && (
        <div className={styles.saveBar}>
          <Button
            variant="brand"
            fullWidth
            loading={save.saving}
            disabled={!dirty || save.saving}
            type={save.formId ? "submit" : "button"}
            form={save.formId}
            onClick={save.formId ? undefined : save.onSave}
            className={styles.saveButton}
          >
            {save.saving ? "Saving…" : save.label ?? "Save"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={askDiscard}
        title="Discard changes?"
        message="What you changed here hasn't been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          setAskDiscard(false)
          goBack()
        }}
        onCancel={() => setAskDiscard(false)}
      />
    </div>
  )
}
