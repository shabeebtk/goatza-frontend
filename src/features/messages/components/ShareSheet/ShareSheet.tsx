"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
  useConversations,
  useMessageTargetSearch,
  useShareContent,
} from "../../hooks/useConversationQueries"
import type {
  Conversation,
  MessageTarget,
  MessageTargetSource,
  ShareFailure,
  ShareTarget,
  ShareTargetType,
} from "../../services/conversations.api"
import styles from "./ShareSheet.module.css"

// The backend caps conversation_ids and recipients at 10 each; capping the
// whole selection at 10 keeps us inside both without splitting the call.
const MAX_SELECTION = 10
const SEARCH_DEBOUNCE_MS = 300
const SKELETON_COUNT = 7
// Matches ShareRequestSerializer.NOTE_MAX_LENGTH.
const NOTE_MAX_LENGTH = 1000

/** Module-level so useSyncExternalStore doesn't resubscribe on every render. */
const subscribeToNothing = () => () => {}

// ── Types ────────────────────────────────────────────────────

/**
 * Somewhere a share can go, normalised from either source (a recent
 * conversation or a search hit) so selection logic doesn't care which.
 */
type ShareCandidate = {
  /**
   * Identity that survives crossing sources: keyed on the thread when one
   * exists, else on the actor. Selecting someone in Recent and then finding
   * them again via search resolves to the same key instead of double-sending.
   */
  key: string
  /** null → no thread yet; goes out as a recipient and the backend creates one. */
  conversationId: string | null
  actorType: "user" | "organization"
  actorId: string
  name: string
  username: string
  avatar: string
}

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  target: ShareTarget
  /** Small preview of what's being shared, rendered at the top of the sheet. */
  previewNode?: ReactNode
  /**
   * The canonical absolute URL of what's being shared. Supplied, the preview
   * row grows a Copy link button and — where the OS offers one — Share via…,
   * so the sheet is a way OUT of Goatza as well as a way across it. Omitted,
   * the sheet is exactly what it was: send-to-a-chat only.
   *
   * Built by the call site, from profileUrl / recruitmentUrl / postUrl. The
   * sheet is given the finished string rather than the id, because "the public
   * URL of this thing" is a per-kind question those three already answer.
   */
  shareUrl?: string
}

// ── Helpers ──────────────────────────────────────────────────

const candidateKey = (
  conversationId: string | null,
  actorType: string,
  actorId: string
) => (conversationId ? `conv:${conversationId}` : `actor:${actorType}:${actorId}`)

function fromConversation(conv: Conversation): ShareCandidate {
  const p = conv.other_participant
  return {
    key: candidateKey(conv.id, p.type, p.id),
    conversationId: conv.id,
    actorType: p.type,
    actorId: p.id,
    name: p.name || p.username,
    username: p.username,
    avatar: p.avatar,
  }
}

function fromTarget(t: MessageTarget): ShareCandidate {
  return {
    key: candidateKey(t.conversation_id, t.type, t.id),
    conversationId: t.conversation_id,
    actorType: t.type,
    actorId: t.id,
    name: t.name || t.username,
    username: t.username,
    avatar: t.avatar,
  }
}

const initialsOf = (c: ShareCandidate) =>
  (c.name || c.username || "?").slice(0, 2).toUpperCase()

// Same priority + labels the messages search uses.
const SEARCH_GROUP_ORDER: { source: MessageTargetSource; label: string }[] = [
  { source: "conversation", label: "Your chats" },
  { source: "following", label: "Following" },
  { source: "all", label: "Other people" },
]

/** Reason codes from messaging/services/exceptions.py, as end-user copy. */
const FAILURE_TEXT: Record<string, string> = {
  not_a_participant: "you're not in that chat",
  conversation_not_found: "chat no longer exists",
  content_unavailable: "this content is no longer available",
  recipient_not_found: "account not found",
  cannot_share_with_self: "you can't share with yourself",
}

/**
 * "Riya: account not found · Dream FC: you're not in that chat"
 *
 * The failure id is a conversation_id for thread targets and an actor_id for
 * recipient targets, so both are matched against.
 */
function describeFailures(
  failed: ShareFailure[],
  chosen: ShareCandidate[]
): string {
  return failed
    .map((f) => {
      const who = chosen.find(
        (c) => c.conversationId === f.id || c.actorId === f.id
      )
      const reason = FAILURE_TEXT[f.reason] ?? "couldn't be reached"
      return `${who?.name ?? "Someone"}: ${reason}`
    })
    .join(" · ")
}

/**
 * Headline and body handed to the OS share sheet, per kind of thing.
 *
 * Deliberately name-free. The sheet knows the target's TYPE and its preview
 * node; it does not know that the post is Riya's or that the trial is Dream
 * FC's, and adding a title/subtitle prop pair to carry that would put the same
 * three strings at every call site for a line most OS sheets truncate anyway.
 * The link unfurls with the real title once it is pasted.
 */
const NATIVE_SHARE_COPY: Record<ShareTargetType, { title: string; text: string }> = {
  post: { title: "Post on Goatza", text: "Have a look at this post on Goatza" },
  recruitment: {
    title: "Trial on Goatza",
    text: "Have a look at this trial on Goatza",
  },
  user: { title: "Profile on Goatza", text: "Have a look at this profile on Goatza" },
  organization: {
    title: "Club on Goatza",
    text: "Have a look at this club on Goatza",
  },
}

// ── Row ──────────────────────────────────────────────────────

function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: ShareCandidate
  selected: boolean
  onToggle: (c: ShareCandidate) => void
}) {
  return (
    <li>
      {/*
        Never disabled at the cap — a selected row must stay clickable to
        deselect, and an unselected one explains the cap via a toast.
      */}
      <button
        type="button"
        className={styles.row}
        onClick={() => onToggle(candidate)}
        aria-pressed={selected}
      >
        <Avatar
          src={candidate.avatar || undefined}
          initials={initialsOf(candidate)}
          size="md"
          className={styles.avatar}
        />

        <span className={styles.rowText}>
          <span className={styles.rowNameLine}>
            <span className={styles.rowName}>{candidate.name}</span>
            {candidate.actorType === "organization" && (
              <span className={styles.orgTag}>Org</span>
            )}
          </span>
          <span className={styles.rowSub}>@{candidate.username}</span>
        </span>

        <span
          className={`${styles.check} ${selected ? styles.checkOn : ""}`}
          aria-hidden="true"
        >
          {selected && <Icon icon="mdi:check" width={14} height={14} />}
        </span>
      </button>
    </li>
  )
}

function RowSkeleton() {
  return (
    <li className={styles.skelRow} aria-hidden="true">
      <span className={styles.skelAvatar} />
      <span className={styles.skelText}>
        <span className={styles.skelLine} />
        <span className={styles.skelLineSm} />
      </span>
      <span className={styles.skelCheck} />
    </li>
  )
}

// ── Sheet ────────────────────────────────────────────────────

function ShareSheetInner({
  onClose,
  target,
  previewNode,
  shareUrl,
}: Omit<ShareSheetProps, "open">) {
  const toast = useToast()
  const titleId = useId()
  const backdropRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [note, setNote] = useState("")
  const [selected, setSelected] = useState<Map<string, ShareCandidate>>(
    () => new Map()
  )

  const { mutate: share, isPending } = useShareContent()

  // Debounce the query (same 300ms as the messages screen).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  const isSearching = debouncedSearch.trim().length > 0

  // Recents. `type: "active"` reuses the exact key the messages screen already
  // caches, so opening the sheet usually paints instantly — and it excludes
  // unanswered requests, which aren't "recent chats".
  const {
    data: conversations,
    isLoading: recentsLoading,
    isError: recentsError,
    refetch: refetchRecents,
  } = useConversations({ type: "active" })

  const {
    data: searchResults,
    isLoading: searchLoading,
    isError: searchError,
    refetch: refetchSearch,
  } = useMessageTargetSearch(debouncedSearch)

  const recents = useMemo(
    () => (conversations ?? []).map(fromConversation),
    [conversations]
  )

  const searchGroups = useMemo(
    () =>
      SEARCH_GROUP_ORDER.map(({ source, label }) => ({
        source,
        label,
        items: (searchResults ?? [])
          .filter((r) => r.source === source)
          .map(fromTarget),
      })).filter((g) => g.items.length > 0),
    [searchResults]
  )

  // ── Body scroll lock ───────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ── Focus: move into the sheet, restore on close ───────────
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // The sheet itself, not the search input — autofocusing the input would
    // throw up the mobile keyboard over the very list you're picking from.
    sheetRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  // ── Esc to close + focus trap ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (e.key !== "Tab") return

      const root = sheetRef.current
      if (!root) return

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // Wrap both ways. Shift+Tab from the sheet container itself also wraps —
      // otherwise focus escapes to the page behind on the first keypress.
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const toggle = useCallback(
    (candidate: ShareCandidate) => {
      const isSelected = selected.has(candidate.key)

      if (!isSelected && selected.size >= MAX_SELECTION) {
        toast.show({
          title: `You can share with up to ${MAX_SELECTION} at once`,
          variant: "warning",
          position: "top-center",
          duration: 2500,
        })
        return
      }

      setSelected((prev) => {
        const next = new Map(prev)
        if (next.has(candidate.key)) next.delete(candidate.key)
        else next.set(candidate.key, candidate)
        return next
      })
    },
    [selected, toast]
  )

  // ── Link out: copy, and hand to the OS ─────────────────────

  // navigator.share exists on mobile Safari/Chrome and almost nowhere else.
  // Read through useSyncExternalStore so SSR and the first client render agree
  // (false), then flip — a bare `typeof navigator` check would hydrate-mismatch.
  // Same reading ProfileShareMenu and useShareRecruitment take.
  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.show({
        title: "Link copied",
        variant: "success",
        position: "top-center",
        duration: 2000,
      })
    } catch {
      // Clipboard is permission-gated and blocked outright in some in-app
      // browsers. Show the URL so it can still be copied by hand.
      toast.show({
        title: "Couldn't copy automatically",
        message: shareUrl,
        variant: "warning",
        position: "top-center",
        duration: 5000,
      })
    }
  }, [shareUrl, toast])

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return
    const copy = NATIVE_SHARE_COPY[target.type]
    try {
      await navigator.share({ title: copy.title, text: copy.text, url: shareUrl })
    } catch {
      // AbortError when the user dismisses the OS sheet. Nothing to report.
    }
  }, [shareUrl, target.type])

  const count = selected.size
  const hasSelection = count > 0

  const handleSend = () => {
    if (!hasSelection || isPending) return

    const chosen = [...selected.values()]

    share(
      {
        target,
        // A candidate with a thread goes by id; one without goes as a
        // recipient for the backend to get-or-create.
        conversation_ids: chosen
          .map((c) => c.conversationId)
          .filter((id): id is string => id !== null),
        recipients: chosen
          .filter((c) => c.conversationId === null)
          .map((c) => ({ actor_type: c.actorType, actor_id: c.actorId })),
        note: note.trim(),
      },
      {
        onSuccess: (result) => {
          const sentCount = result.sent.length
          const failures = result.failed

          // Nothing landed — keep the sheet open so it can be retried.
          if (sentCount === 0) {
            toast.show({
              title: "Couldn't share",
              message: describeFailures(failures, chosen) || undefined,
              variant: "error",
              position: "top-center",
              duration: 5000,
            })
            return
          }

          toast.show({
            title: failures.length
              ? `Sent to ${sentCount} of ${chosen.length}`
              : sentCount === 1
                ? "Sent"
                : `Sent to ${sentCount} people`,
            message: failures.length
              ? describeFailures(failures, chosen)
              : undefined,
            variant: failures.length ? "warning" : "success",
            position: "top-center",
            duration: failures.length ? 5000 : 2500,
          })
          onClose()
        },
        onError: (err) => {
          toast.show({
            title: getApiErrorMessage(err, "Couldn't share right now"),
            variant: "error",
            position: "top-center",
            duration: 4000,
          })
        },
      }
    )
  }

  // ── List body ──────────────────────────────────────────────

  const renderStates = (
    isLoading: boolean,
    isError: boolean,
    onRetry: () => void,
    isEmpty: boolean,
    emptyNode: ReactNode
  ) => {
    if (isLoading) {
      return (
        <ul className={styles.list}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </ul>
      )
    }

    if (isError) {
      return (
        <div className={styles.stateBox} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} />
          <p className={styles.stateTitle}>Couldn&apos;t load</p>
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            <Icon icon="mdi:refresh" width={15} height={15} />
            Retry
          </button>
        </div>
      )
    }

    if (isEmpty) return emptyNode

    return null
  }

  const searchState = renderStates(
    searchLoading,
    searchError,
    () => void refetchSearch(),
    searchGroups.length === 0,
    <div className={styles.stateBox}>
      <Icon icon="mdi:account-search-outline" width={36} height={36} />
      <p className={styles.stateTitle}>No results</p>
      <p className={styles.stateSub}>
        Nothing found for &ldquo;{debouncedSearch}&rdquo;.
      </p>
    </div>
  )

  const recentsState = renderStates(
    recentsLoading,
    recentsError,
    () => void refetchRecents(),
    recents.length === 0,
    <div className={styles.stateBox}>
      <Icon icon="mdi:message-outline" width={36} height={36} />
      <p className={styles.stateTitle}>No conversations yet</p>
      <p className={styles.stateSub}>Search for someone to share with.</p>
    </div>
  )

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
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

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Share
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close share sheet"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── What's being shared ──
            Preview on the left, the two link-out actions on the right. Without
            a shareUrl the row stays a plain block holding only the preview,
            which is what it has always been. */}
        {(previewNode || shareUrl) && (
          <div
            className={`${styles.preview} ${shareUrl ? styles.previewWithActions : ""}`}
          >
            {previewNode && (
              <div className={styles.previewMain}>{previewNode}</div>
            )}

            {shareUrl && (
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.previewAction}
                  onClick={() => void handleCopyLink()}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  <Icon icon="mdi:link-variant" width={17} height={17} />
                  <span className={styles.previewActionLabel}>Copy</span>
                </button>

                {canNativeShare && (
                  <button
                    type="button"
                    className={styles.previewAction}
                    onClick={() => void handleNativeShare()}
                    aria-label="Share via another app"
                    title="Share via…"
                  >
                    <Icon icon="mdi:export-variant" width={17} height={17} />
                    <span className={styles.previewActionLabel}>Share</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Search ── */}
        <div className={styles.searchWrap}>
          <Icon
            icon="mdi:magnify"
            width={17}
            height={17}
            className={styles.searchIcon}
          />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search people, organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search people and organizations to share with"
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setSearch("")
                setDebouncedSearch("")
              }}
              aria-label="Clear search"
            >
              <Icon icon="mdi:close" width={14} height={14} />
            </button>
          )}
        </div>

        {/* ── List ── */}
        <div className={styles.body}>
          {isSearching ? (
            (searchState ?? (
              <>
                {searchGroups.map((group) => (
                  <div key={group.source}>
                    <p className={styles.groupLabel}>{group.label}</p>
                    <ul className={styles.list}>
                      {group.items.map((c) => (
                        <CandidateRow
                          key={c.key}
                          candidate={c}
                          selected={selected.has(c.key)}
                          onToggle={toggle}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            ))
          ) : (
            (recentsState ?? (
              <>
                <p className={styles.groupLabel}>Recent</p>
                <ul className={styles.list}>
                  {recents.map((c) => (
                    <CandidateRow
                      key={c.key}
                      candidate={c}
                      selected={selected.has(c.key)}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
              </>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          {hasSelection && (
            <input
              type="text"
              className={styles.noteInput}
              placeholder="Write a message..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              aria-label="Write a message to send with this"
            />
          )}

          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!hasSelection || isPending}
          >
            {isPending ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Sending…
              </>
            ) : count > 0 ? (
              `Send (${count})`
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Instagram-style share sheet: bottom sheet on mobile, centered modal on
 * desktop. Used for both post and recruitment sharing.
 *
 * Gating the inner component on `open` (rather than hiding it with CSS) means
 * the recents query only runs when the sheet is actually opened, and selection
 * state resets each time it closes.
 */
export default function ShareSheet({ open, ...rest }: ShareSheetProps) {
  // createPortal needs `document`, so nothing may render on the server pass.
  // useSyncExternalStore (rather than a mounted flag set in an effect) gets
  // this without a cascading render: false through SSR + hydration, true after.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )

  if (!open || !mounted) return null

  return <ShareSheetInner {...rest} />
}
