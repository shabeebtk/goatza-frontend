"use client"

/**
 * DownloadApplicantsSheet — the applicants as an Excel file, owner/admin only.
 *
 *   1. WHAT — "This view" (the tab, search and filters on screen) or "All
 *      applicants" (every stage, withdrawn left out).
 *   2. WHICH ROWS — only past 100: one file holds at most 100 rows, so a
 *      bigger list is picked by batch. Batches are in a FIXED oldest-first
 *      order on the server, so "101–200" is still the same people when the
 *      org comes back for it. A batch fetched this session wears a ✓, and the
 *      next one not yet fetched is preselected.
 *
 * A single-file download closes the sheet; a batch keeps it open, because
 * the org is usually working through all of them.
 */

import { useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
  APPLICANTS_EXPORT_BATCH,
  downloadApplicantsApi,
  type ApplicantsExportScope,
} from "../../services/recruitments.api"
import type { ApplicantsQueryParams } from "../../hooks/useRecruitments"
import styles from "./DownloadApplicantsSheet.module.css"

type Batch = { start: number; end: number; label: string }

function batchesFor(count: number): Batch[] {
  const batches: Batch[] = []
  for (let start = 1; start <= count; start += APPLICANTS_EXPORT_BATCH) {
    const end = Math.min(start + APPLICANTS_EXPORT_BATCH - 1, count)
    batches.push({ start, end, label: `${start}–${end}` })
  }
  return batches
}

/**
 * Which downloads this session has done. "This view" is keyed by its exact
 * params, so a ✓ never carries over to a different filter.
 */
export function downloadKey(
  scope: ApplicantsExportScope,
  params: ApplicantsQueryParams,
  start: number,
): string {
  return `${scope}|${scope === "filtered" ? JSON.stringify(params) : ""}|${start}`
}

/** Hand the browser a file: object URL → a temporary <a download> → revoke. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked a tick later: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface DownloadApplicantsSheetProps {
  recruitmentId: string
  /** EXACTLY the params the list is showing — one builder for both. */
  queryParams: ApplicantsQueryParams
  /** The list's own `count` (page 1). */
  viewCount: number
  /** Every application minus withdrawn, from status_counts. */
  allCount: number
  downloaded: Set<string>
  onDownloaded: (key: string) => void
  onClose: () => void
}

export default function DownloadApplicantsSheet({
  recruitmentId,
  queryParams,
  viewCount,
  allCount,
  downloaded,
  onDownloaded,
  onClose,
}: DownloadApplicantsSheetProps) {
  const id = useId()
  const toast = useToast()

  const [scope, setScope] = useState<ApplicantsExportScope>(
    viewCount > 0 ? "filtered" : "all",
  )
  const [pending, setPending] = useState(false)

  useBodyScrollLock()
  const { requestClose } = useBackToClose(onClose)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) requestClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [pending, requestClose])

  const count = scope === "filtered" ? viewCount : allCount
  const batches = useMemo(() => batchesFor(count), [count])
  const isBatched = count > APPLICANTS_EXPORT_BATCH

  const isDone = (start: number) => downloaded.has(downloadKey(scope, queryParams, start))
  const nextStart = () =>
    (batches.find((batch) => !isDone(batch.start)) ?? batches[0])?.start ?? 1

  // The batch picked on step 2. Re-seeded whenever the scope changes, to the
  // first batch not downloaded yet.
  const [start, setStart] = useState<number>(nextStart)
  const [startScope, setStartScope] = useState(scope)
  if (startScope !== scope) {
    setStartScope(scope)
    setStart(nextStart())
  }

  const batch = batches.find((b) => b.start === start) ?? batches[0]

  const download = async () => {
    if (pending || !batch || count === 0) return
    setPending(true)
    try {
      const { blob, filename } = await downloadApplicantsApi(
        recruitmentId, queryParams, scope, batch.start, batch.end,
      )
      saveBlob(blob, filename)
      onDownloaded(downloadKey(scope, queryParams, batch.start))

      if (!isBatched) {
        requestClose()
        return
      }
      // Keep going: move the selection on to the next batch not yet taken.
      const next = batches.find(
        (b) => b.start !== batch.start && !isDone(b.start),
      )
      if (next) setStart(next.start)
    } catch (err) {
      toast.show({
        title: getApiErrorMessage(err, "Couldn't download applicants."),
        variant: "error",
      })
    } finally {
      setPending(false)
    }
  }

  const scopeCard = (
    value: ApplicantsExportScope,
    title: string,
    cardCount: number,
    detail: string,
  ) => {
    const disabled = cardCount === 0
    return (
      <button
        type="button"
        role="radio"
        aria-checked={scope === value}
        disabled={disabled || pending}
        className={`${styles.card} ${scope === value ? styles.cardActive : ""}`}
        onClick={() => setScope(value)}
      >
        <span className={styles.radio} aria-hidden="true">
          {scope === value && <span className={styles.radioDot} />}
        </span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.cardDetail}>
            {cardCount} applicant{cardCount === 1 ? "" : "s"} · {detail}
          </span>
        </span>
      </button>
    )
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) requestClose()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title} id={`${id}-title`}>Download applicants</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={requestClose}
            disabled={pending}
            aria-label="Close"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.step}>What to download?</p>
          <div className={styles.cards} role="radiogroup" aria-label="What to download">
            {scopeCard("filtered", "This view", viewCount, "current tab, search and filters")}
            {scopeCard("all", "All applicants", allCount, "every stage, withdrawn left out")}
          </div>

          {isBatched && (
            <>
              <p className={styles.step}>Pick a batch (max {APPLICANTS_EXPORT_BATCH} per file)</p>
              <div className={styles.batches} role="radiogroup" aria-label="Batch">
                {batches.map((b) => {
                  const done = isDone(b.start)
                  return (
                    <button
                      key={b.start}
                      type="button"
                      role="radio"
                      aria-checked={start === b.start}
                      disabled={pending}
                      className={`${styles.batch} ${start === b.start ? styles.batchActive : ""}`}
                      onClick={() => setStart(b.start)}
                    >
                      <span className={styles.radio} aria-hidden="true">
                        {start === b.start && <span className={styles.radioDot} />}
                      </span>
                      <span className={styles.batchLabel}>{b.label}</span>
                      {done && (
                        <span className={styles.doneTag}>
                          <Icon icon="mdi:check" width={13} height={13} />
                          Downloaded
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <p className={styles.note}>
            <Icon icon="mdi:shield-account-outline" width={14} height={14} />
            Contains players&apos; phone numbers and emails. Keep it inside your club.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.downloadBtn}
            onClick={download}
            disabled={pending || count === 0 || !batch}
          >
            {pending ? (
              <span className={styles.spinner} aria-hidden="true" />
            ) : (
              <Icon icon="mdi:download-outline" width={17} height={17} />
            )}
            {isBatched && batch ? `Download ${batch.label}` : `Download ${count}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
