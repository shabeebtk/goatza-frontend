"use client"

/**
 * "Share card" — the generated image of a player's profile, and the picker that
 * decides which three details go on it.
 *
 * Two things are worth knowing before reading the rest.
 *
 * The catalog is fetched from `/public/profile/<username>`, the same anonymous
 * bundle the renderer itself reads, rather than from whatever profile object
 * the host component happens to hold. The authenticated payload does not carry
 * the primary sport's attributes (so "Preferred foot" would silently vanish
 * from your own picker), and fetching the renderer's own source is the only way
 * the picker and the card cannot disagree about what a player has.
 *
 * That also means the sheet inherits the card's privacy rule for free: a
 * profile with the public toggle off 404s here exactly as it does at the
 * renderer, and the sheet says so instead of showing a broken image.
 *
 * The picker only renders for the profile's owner (§5.3). A scout can forward
 * somebody's card, but nobody can craft one that emphasises another player's
 * weight.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getPublicUserProfile } from "@/features/profile/services/publicProfile.api"
import { profileUrl } from "@/shared/services/profileUrl"
import { buildCardUrl } from "@/features/profile/utils/shareCard/cardUrl"
import {
  SLOT_COUNT,
  buildSlotCatalog,
  defaultSlotKeys,
} from "@/features/profile/utils/shareCard/slots"
import styles from "./ShareCardSheet.module.css"

/** Long enough that dragging through the checkboxes does not fire a render per
 *  tap, short enough that the preview feels attached to the choice. */
const PREVIEW_DEBOUNCE_MS = 400

/** Module-level so useSyncExternalStore doesn't resubscribe every render. */
const subscribeToNothing = () => () => {}

/**
 * Whether this browser can hand a PNG to the OS share sheet.
 *
 * The whole point of the Share action is that it drops the image straight into
 * the Instagram Stories composer, and that only works through the files path.
 * Desktop Chrome has `navigator.share` but not file support, so testing for
 * `share` alone would render a button that throws — the check has to be
 * `canShare` with an actual File.
 */
function detectFileShare(): boolean {
  if (typeof navigator === "undefined") return false
  if (typeof navigator.share !== "function") return false
  if (typeof navigator.canShare !== "function") return false

  try {
    return navigator.canShare({
      files: [new File([new Uint8Array(1)], "card.png", { type: "image/png" })],
    })
  } catch {
    return false
  }
}

interface ShareCardSheetProps {
  open: boolean
  onClose: () => void
  username: string
  name: string
  /** §5.3 — the picker is the owner's, the card is anyone's. */
  canCustomise: boolean
}

function ShareCardSheetInner({
  onClose,
  username,
  name,
  canCustomise,
}: Omit<ShareCardSheetProps, "open">) {
  const toast = useToast()
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<string[] | null>(null)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [busy, setBusy] = useState<"share" | "download" | null>(null)

  const canShareFiles = useSyncExternalStore(
    subscribeToNothing,
    detectFileShare,
    () => false
  )

  const { data: bundle, isPending, isError } = useQuery({
    queryKey: ["share-card", "catalog", username],
    queryFn: () => getPublicUserProfile(username),
    // The catalog only moves when the profile does, and the sheet is opened and
    // closed repeatedly while picking. Stale for the session is right.
    staleTime: 5 * 60_000,
  })

  const catalog = useMemo(
    () => (bundle ? buildSlotCatalog(bundle.profile) : []),
    [bundle]
  )

  // Seed the picker from the default order the moment the catalog lands, and
  // never again — re-seeding on every render would fight the user's taps.
  useEffect(() => {
    if (catalog.length > 0 && selected === null) {
      setSelected(defaultSlotKeys(catalog))
    }
  }, [catalog, selected])

  const chosen = useMemo(() => selected ?? [], [selected])

  // Debounced separately from `chosen`, so the <img> src only changes once the
  // tapping stops — every change is a fresh render at the origin.
  const [debouncedSlots, setDebouncedSlots] = useState<string[]>([])
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSlots(chosen), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [chosen])

  const previewUrl = useMemo(() => {
    if (!bundle) return null
    return buildCardUrl({
      username,
      format: "story",
      slots: debouncedSlots,
      updatedAt: bundle.profile.updated_at,
    })
  }, [bundle, username, debouncedSlots])

  // A new URL means a new image; show the skeleton until it paints.
  useEffect(() => {
    setPreviewLoaded(false)
  }, [previewUrl])

  const toggle = useCallback(
    (key: string) => {
      setSelected((current) => {
        const list = current ?? []
        if (list.includes(key)) return list.filter((k) => k !== key)
        // Silently ignored rather than swapping the oldest out: the note under
        // the rows tells you to deselect one, and a card that quietly drops a
        // field you chose is worse than a tap that does nothing.
        if (list.length >= SLOT_COUNT) return list
        return [...list, key]
      })
    },
    []
  )

  const fetchCardBlob = useCallback(async (): Promise<Blob> => {
    if (!previewUrl) throw new Error("No card to fetch")

    const response = await fetch(previewUrl)
    if (!response.ok) throw new Error(`Card render failed: ${response.status}`)

    return response.blob()
  }, [previewUrl])

  const handleShare = async () => {
    setBusy("share")
    try {
      const file = new File([await fetchCardBlob()], `${username}-goatza.png`, {
        type: "image/png",
      })

      // Re-checked with the REAL file: canShare is size- and type-sensitive on
      // some platforms, and the probe at render time used a 1-byte stand-in.
      if (!navigator.canShare?.({ files: [file] })) {
        throw new Error("This browser can't share the image")
      }

      await navigator.share({
        files: [file],
        title: `${name} on Goatza`,
      })
    } catch (error) {
      // AbortError is the user dismissing the OS sheet. Nothing to report.
      if ((error as Error)?.name !== "AbortError") {
        toast.show({
          title: "Couldn't share the card",
          message: "Try downloading it instead.",
          variant: "error",
          position: "top-center",
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleDownload = async () => {
    setBusy("download")
    try {
      const url = URL.createObjectURL(await fetchCardBlob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${username}-goatza.png`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.show({
        title: "Couldn't download the card",
        variant: "error",
        position: "top-center",
      })
    } finally {
      setBusy(null)
    }
  }

  const handleCopyLink = async () => {
    // The PROFILE url, not the image url. Somebody pasting this into a chat
    // wants the profile behind the card, and the link preview renders the card
    // anyway.
    const url = profileUrl(username, "user")
    try {
      await navigator.clipboard.writeText(url)
      toast.show({
        title: "Link copied",
        variant: "success",
        position: "top-center",
        duration: 2000,
      })
    } catch {
      toast.show({
        title: "Couldn't copy automatically",
        message: url,
        variant: "warning",
        position: "top-center",
        duration: 5000,
      })
    }
  }

  // ── Modal mechanics (mirrors ShareSheet) ───────────────────

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    sheetRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // ── Render ─────────────────────────────────────────────────

  const unavailable = isError || (!isPending && !bundle)

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.handle} aria-hidden="true" />

        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Share card
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close share card"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <div className={styles.body}>
          {unavailable ? (
            <div className={styles.state}>
              <Icon icon="mdi:eye-off-outline" width={30} height={30} />
              <p className={styles.stateTitle}>No card for this profile</p>
              <p className={styles.stateSub}>
                {canCustomise
                  ? "Turn your public profile on in Settings to generate a shareable card."
                  : "This profile isn't public, so there's nothing to share."}
              </p>
            </div>
          ) : (
            <>
              {/* ── Live preview ── */}
              <div className={styles.previewWrap}>
                {!previewLoaded && <div className={styles.previewSkeleton} aria-hidden="true" />}
                {previewUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     the card is a generated PNG at a fixed size from our own
                     route; next/image would put a second transform layer in
                     front of an image we already control the dimensions of. */
                  <img
                    src={previewUrl}
                    alt={`Share card for ${name}`}
                    className={styles.preview}
                    style={{ opacity: previewLoaded ? 1 : 0 }}
                    onLoad={() => setPreviewLoaded(true)}
                    onError={() => setPreviewLoaded(true)}
                  />
                )}
              </div>

              {/* ── Picker (owner only) ── */}
              {canCustomise && catalog.length > 0 && (
                <div className={styles.picker}>
                  <p className={styles.pickerSub}>
                    Pick the three details that matter most. You can change them any
                    time.
                  </p>

                  <div className={styles.pickerLabel}>Always shown</div>
                  <div className={styles.locked}>
                    Photo, name, handle, sport, position and your verified club.
                  </div>

                  <div className={styles.pickerHead}>
                    <span className={styles.pickerLabel}>Card details</span>
                    <span className={styles.pickerCount}>
                      {chosen.length} of {SLOT_COUNT} chosen
                    </span>
                  </div>

                  {catalog.map((candidate) => {
                    const on = chosen.includes(candidate.key)
                    const full = chosen.length >= SLOT_COUNT

                    return (
                      <button
                        key={candidate.key}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={!on && full}
                        className={`${styles.row} ${on ? styles.rowOn : ""}`}
                        onClick={() => toggle(candidate.key)}
                      >
                        <span className={`${styles.box} ${on ? styles.boxOn : ""}`}>
                          {on && <Icon icon="mdi:check" width={12} height={12} />}
                        </span>
                        <span className={styles.rowKey}>{candidate.label}</span>
                        <span className={styles.rowValue}>{candidate.value}</span>
                      </button>
                    )
                  })}

                  <p className={styles.pickerNote}>
                    {chosen.length >= SLOT_COUNT
                      ? "Deselect one to swap in another."
                      : "Nothing you leave out is hidden — it stays on your profile."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Actions ── */}
        {!unavailable && (
          <div className={styles.actions}>
            {canShareFiles && (
              <button
                type="button"
                className={styles.primary}
                onClick={handleShare}
                disabled={busy !== null || !previewUrl}
              >
                {busy === "share" ? (
                  <Icon icon="mdi:loading" className={styles.spin} width={17} height={17} />
                ) : (
                  <Icon icon="mdi:export-variant" width={17} height={17} />
                )}
                Share
              </button>
            )}

            <button
              type="button"
              className={styles.secondary}
              onClick={handleDownload}
              disabled={busy !== null || !previewUrl}
            >
              {busy === "download" ? (
                <Icon icon="mdi:loading" className={styles.spin} width={17} height={17} />
              ) : (
                <Icon icon="mdi:download-outline" width={17} height={17} />
              )}
              Download
            </button>

            <button type="button" className={styles.secondary} onClick={handleCopyLink}>
              <Icon icon="mdi:link-variant" width={17} height={17} />
              Copy link
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function ShareCardSheet({ open, ...rest }: ShareCardSheetProps) {
  // createPortal needs `document`, so nothing may render on the server pass.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false)

  // Gated rather than hidden: the catalog query should not run until the sheet
  // is opened, and the picker state should reset each time it closes.
  if (!open || !mounted) return null

  return <ShareCardSheetInner {...rest} />
}
