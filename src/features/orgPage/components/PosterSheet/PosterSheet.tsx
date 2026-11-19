"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Icon } from "@iconify/react"

import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import { saveBlob } from "@/features/squads/services/squadQr"
import Button from "@/shared/components/ui/Button/Button"
import { pagePosterPng, type PosterInput, type PosterTheme } from "../../services/pagePoster"
import PageSegmented from "../PageSegmented/PageSegmented"
import PageSheet from "../PageSheet/PageSheet"
import styles from "./PosterSheet.module.css"

const subscribeToNothing = () => () => {}

type Drawn = { key: string; url: string; blob: Blob }

/**
 * The QR poster: an A4 PNG to print or send, in a light (the default; prints
 * well) or dark version. The preview is the PNG itself, as an object URL that is
 * revoked when the next one replaces it and when the sheet closes.
 */
export default function PosterSheet({
  orgId,
  input,
  onClose,
}: {
  orgId: string
  /** Everything but the sport and city, which come from the profile. */
  input: Omit<PosterInput, "primarySport" | "primaryCity">
  onClose: () => void
}) {
  const { data: org, isLoading: orgLoading } = useOrgDetail(orgId)
  const [theme, setTheme] = useState<PosterTheme>("light")
  const [attempt, setAttempt] = useState(0)
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const urls = useRef<string[]>([])

  const sport = org?.sports?.find((item) => item.is_primary) ?? org?.sports?.[0]
  const city = (org?.locations?.find((item) => item.is_primary) ?? org?.locations?.[0])?.city
  const key = `${theme}:${attempt}`
  const drawing = !orgLoading && drawn?.key !== key && failedKey !== key

  useEffect(() => {
    if (orgLoading) return
    let cancelled = false
    pagePosterPng({ ...input, primarySport: sport?.name, primaryCity: city }, theme).then(
      (blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        // One preview at a time: the list is emptied in place, never replaced.
        urls.current.forEach((old) => URL.revokeObjectURL(old))
        urls.current.length = 0
        urls.current.push(url)
        setDrawn({ key, url, blob })
      },
      () => {
        if (!cancelled) setFailedKey(key)
      }
    )
    return () => {
      cancelled = true
    }
    // `input` is rebuilt by the parent each render; what it says is in these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, orgLoading, sport?.name, city, input.orgName, input.username, input.logoUrl, input.ageMin, input.ageMax, input.enquiryFormOn])

  // Every preview URL goes with the sheet.
  useEffect(() => {
    const list = urls.current
    return () => {
      list.forEach((url) => URL.revokeObjectURL(url))
      list.length = 0
    }
  }, [])

  const canShareFiles = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false
      try {
        const probe = new File([new Blob()], "poster.png", { type: "image/png" })
        return navigator.canShare({ files: [probe] })
      } catch {
        return false
      }
    },
    () => false
  )

  const fileName = `${input.username}-poster.png`
  const ready = drawn?.key === key ? drawn : null

  return (
    <PageSheet
      title="QR poster"
      onClose={onClose}
      footer={() => (
        <div className={styles.actions}>
          <Button
            variant="brand"
            fullWidth
            disabled={!ready}
            leftIcon={<Icon icon="mdi:download" width={18} height={18} />}
            onClick={() => ready && saveBlob(ready.blob, fileName)}
          >
            Download poster
          </Button>
          {canShareFiles && (
            <Button
              variant="outline"
              fullWidth
              disabled={!ready}
              leftIcon={<Icon icon="mdi:share-variant-outline" width={18} height={18} />}
              onClick={async () => {
                if (!ready) return
                try {
                  await navigator.share({
                    files: [new File([ready.blob], fileName, { type: "image/png" })],
                    title: input.orgName,
                  })
                } catch {
                  // Dismissed, or refused: the Download button is still there.
                }
              }}
            >
              Share
            </Button>
          )}
        </div>
      )}
    >
      {() => (
        <div className={styles.body}>
          <PageSegmented
            label="Poster colours"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={setTheme}
          />
          <div className={styles.preview} aria-busy={drawing || undefined}>
            {failedKey === key ? (
              <div className={styles.failed} role="alert">
                <p>Couldn&apos;t draw the poster.</p>
                <Button variant="outline" onClick={() => setAttempt((count) => count + 1)}>
                  Try again
                </Button>
              </div>
            ) : ready ? (
              // eslint-disable-next-line @next/next/no-img-element -- an object URL of a PNG drawn here
              <img src={ready.url} alt={`QR poster for ${input.orgName}`} className={styles.image} />
            ) : (
              <span className={styles.spinner} role="status" aria-label="Drawing the poster" />
            )}
          </div>
          <p className={styles.hint}>A4, ready to print. Put it up where families wait.</p>
        </div>
      )}
    </PageSheet>
  )
}
