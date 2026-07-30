"use client"

/**
 * HighlightsManagePage — the owner's curation screen, on its own route.
 *
 * A page rather than a sheet: reordering, renaming and re-scoping a reel is
 * deliberate work, not a quick action, and it needs room to breathe on a phone.
 *
 * Self-scoped like the API: it always manages the SIGNED-IN player's reel, so
 * there is no username in the URL and nothing to get wrong.
 *
 * Reordering is pointer-based rather than HTML5 drag-and-drop: this has to work
 * on a phone, where dragstart never fires. Tile rectangles are measured ONCE at
 * drag start — re-measuring while the preview reflows would feed the drag its
 * own output. Arrow buttons do the same job for keyboard and for anyone who
 * would rather tap than drag.
 */

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import {
    useDeleteHighlight,
    useHighlightStats,
    useHighlights,
    useReorderHighlights,
    useUpdateHighlight,
} from "../../hooks/useHighlights"
import {
    HIGHLIGHT_VISIBILITIES,
    MAX_HIGHLIGHTS,
    type Highlight,
    type HighlightStat,
    type HighlightVisibility,
} from "../../types"
import { VISIBILITY_META, formatClipDuration } from "../../visibilityMeta"
import AddHighlightModal from "../AddHighlightModal/AddHighlightModal"
import styles from "./HighlightsManagePage.module.css"

const MAX_TITLE = 80

export default function HighlightsManagePage() {
    const router = useRouter()
    const { toProfile } = useNavigation()

    const username = useAuthStore((s) => s.user?.username)
    const role = useAuthStore((s) => s.user?.role)
    const actorType = useAuthStore((s) => s.actorType)

    const [addOpen, setAddOpen] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    const canManage = actorType === "user" && role === "player"

    const { data, isLoading, isError, refetch } = useHighlights(
        canManage ? username : null
    )
    const { data: stats } = useHighlightStats({ enabled: canManage })
    const reorder = useReorderHighlights()
    const remove = useDeleteHighlight()

    const clips = useMemo(() => data?.results ?? [], [data?.results])

    const statsById = useMemo(
        () => new Map((stats?.results ?? []).map((row) => [row.id, row])),
        [stats?.results]
    )

    /** Preview order while a drag is in progress; null when not dragging. */
    const [dragIds, setDragIds] = useState<string[] | null>(null)
    const [draggingId, setDraggingId] = useState<string | null>(null)

    const gridRef = useRef<HTMLUListElement | null>(null)
    const rectsRef = useRef<{ id: string; rect: DOMRect }[]>([])
    const orderRef = useRef<string[]>([])
    const movedRef = useRef(false)

    const orderedClips = useMemo(() => {
        if (!dragIds) return clips
        const byId = new Map(clips.map((c) => [c.id, c]))
        return dragIds
            .map((id) => byId.get(id))
            .filter((c): c is Highlight => Boolean(c))
    }, [clips, dragIds])

    const usedSlots = clips.length
    const atCap = usedSlots >= MAX_HIGHLIGHTS

    // ── reorder ────────────────────────────────────────────────

    const commitOrder = useCallback(
        (ids: string[]) => {
            const current = clips.map((c) => c.id)
            const changed = ids.some((id, i) => id !== current[i])
            if (changed) reorder.mutate(ids)
        },
        [clips, reorder]
    )

    const onDragPointerDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
            const grid = gridRef.current
            if (!grid) return

            rectsRef.current = Array.from(
                grid.querySelectorAll<HTMLLIElement>("[data-clip-id]")
            ).map((el) => ({
                id: el.dataset.clipId ?? "",
                rect: el.getBoundingClientRect(),
            }))

            orderRef.current = clips.map((c) => c.id)
            movedRef.current = false

            setDraggingId(id)
            setDragIds(orderRef.current)
            e.currentTarget.setPointerCapture(e.pointerId)
        },
        [clips]
    )

    const onDragPointerMove = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>) => {
            if (!draggingId) return

            const hit = rectsRef.current.find(
                ({ rect }) =>
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
            )
            if (!hit || hit.id === draggingId) return

            const order = orderRef.current
            const from = order.indexOf(draggingId)
            const to = order.indexOf(hit.id)
            if (from === -1 || to === -1 || from === to) return

            const next = [...order]
            next.splice(from, 1)
            next.splice(to, 0, draggingId)
            orderRef.current = next
            movedRef.current = true
            setDragIds(next)
        },
        [draggingId]
    )

    const onDragPointerUp = useCallback(() => {
        if (!draggingId) return
        const finalOrder = orderRef.current
        const moved = movedRef.current

        setDraggingId(null)
        setDragIds(null)
        movedRef.current = false

        if (moved) commitOrder(finalOrder)
    }, [commitOrder, draggingId])

    const nudge = useCallback(
        (id: string, direction: -1 | 1) => {
            const ids = clips.map((c) => c.id)
            const from = ids.indexOf(id)
            const to = from + direction
            if (from === -1 || to < 0 || to >= ids.length) return
            const next = [...ids]
            next.splice(from, 1)
            next.splice(to, 0, id)
            commitOrder(next)
        },
        [clips, commitOrder]
    )

    // ── guard ──────────────────────────────────────────────────

    if (!canManage) {
        return (
            <main className={styles.page}>
                <div className={styles.state}>
                    <Icon icon="mdi:lock-outline" width={34} height={34} />
                    <p className={styles.stateTitle}>Highlights are for players</p>
                    <span className={styles.stateHint}>
                        {actorType === "organization"
                            ? "Switch to your personal account to manage your highlights."
                            : "Only player accounts can build a highlights reel."}
                    </span>
                    <button
                        type="button"
                        className={styles.stateBtn}
                        onClick={() => router.back()}
                    >
                        Go back
                    </button>
                </div>
            </main>
        )
    }

    return (
        <main className={styles.page}>
            {/* ── Page header ── */}
            <header className={styles.header}>
                <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => router.back()}
                    aria-label="Go back"
                >
                    <Icon icon="mdi:arrow-left" width={20} height={20} />
                </button>

                <div className={styles.headerText}>
                    <h1 className={styles.title}>Manage highlights</h1>
                    <p className={styles.slots}>
                        {usedSlots} of {MAX_HIGHLIGHTS} slots used
                    </p>
                </div>

                {username && (
                    <button
                        type="button"
                        className={styles.viewProfileBtn}
                        onClick={() => router.push(toProfile(username, "user"))}
                    >
                        <Icon icon="mdi:account-outline" width={15} height={15} />
                        <span className={styles.viewProfileLabel}>Profile</span>
                    </button>
                )}
            </header>

            <div className={styles.content}>
                {/* ── Reel analytics ── */}
                {clips.length > 0 && stats && (
                    <section className={styles.insights}>
                        <span className={styles.insightIcon} aria-hidden="true">
                            <Icon
                                icon={
                                    stats.totals.recruiter_viewers > 0
                                        ? "mdi:eye-check-outline"
                                        : "mdi:eye-outline"
                                }
                                width={18}
                                height={18}
                            />
                        </span>
                        <div className={styles.insightText}>
                            {stats.totals.recruiter_viewers > 0 ? (
                                <>
                                    <strong className={styles.insightHeadline}>
                                        Seen by {stats.totals.recruiter_viewers} recruiter
                                        {stats.totals.recruiter_viewers === 1 ? "" : "s"}
                                    </strong>
                                    <span className={styles.insightSub}>
                                        {stats.totals.views} play
                                        {stats.totals.views === 1 ? "" : "s"} across your
                                        reel
                                    </span>
                                </>
                            ) : (
                                <>
                                    <strong className={styles.insightHeadline}>
                                        No recruiters yet
                                    </strong>
                                    <span className={styles.insightSub}>
                                        Scouts, coaches and clubs who watch your reel will
                                        show up here.
                                    </span>
                                </>
                            )}
                        </div>
                    </section>
                )}

                {/* ── Add ── */}
                <div className={styles.addRow}>
                    <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => setAddOpen(true)}
                        disabled={atCap}
                    >
                        <Icon icon="mdi:plus" width={18} height={18} />
                        Add clip
                    </button>
                    {atCap && (
                        <span className={styles.capNote}>
                            You&rsquo;ve used all {MAX_HIGHLIGHTS} slots — delete one to
                            add another.
                        </span>
                    )}
                </div>

                {/* ── Loading ── */}
                {isLoading && (
                    <ul className={styles.grid}>
                        {[0, 1, 2].map((i) => (
                            <li key={i} className={styles.skeletonRow}>
                                <span className={styles.skeletonThumb} />
                                <span className={styles.skeletonLines} />
                            </li>
                        ))}
                    </ul>
                )}

                {/* ── Error ── */}
                {isError && !isLoading && (
                    <div className={styles.state}>
                        <Icon icon="mdi:cloud-off-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>
                            Couldn&rsquo;t load your highlights.
                        </p>
                        <button
                            type="button"
                            className={styles.stateBtn}
                            onClick={() => void refetch()}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* ── Empty ── */}
                {!isLoading && !isError && clips.length === 0 && (
                    <div className={styles.state}>
                        <Icon icon="mdi:play-box-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>No highlights yet</p>
                        <span className={styles.stateHint}>
                            Add up to {MAX_HIGHLIGHTS} clips of 90 seconds or less.
                            Recruiters watch these first.
                        </span>
                    </div>
                )}

                {/* ── Rows ── */}
                {!isLoading && orderedClips.length > 0 && (
                    <ul className={styles.grid} ref={gridRef}>
                        {orderedClips.map((clip, index) => (
                            <ManageRow
                                key={clip.id}
                                clip={clip}
                                index={index}
                                total={orderedClips.length}
                                isDragging={draggingId === clip.id}
                                stat={statsById.get(clip.id)}
                                onDragPointerDown={onDragPointerDown}
                                onDragPointerMove={onDragPointerMove}
                                onDragPointerUp={onDragPointerUp}
                                onNudge={nudge}
                                onRequestDelete={() => setConfirmId(clip.id)}
                            />
                        ))}
                    </ul>
                )}
            </div>

            {addOpen && <AddHighlightModal onClose={() => setAddOpen(false)} />}

            {confirmId && (
                <div className={styles.confirmBackdrop}>
                    <div className={styles.confirmCard} role="alertdialog">
                        <h3 className={styles.confirmTitle}>Delete this clip?</h3>
                        <p className={styles.confirmText}>
                            It disappears from your profile and frees a slot towards your{" "}
                            {MAX_HIGHLIGHTS}.
                        </p>
                        <div className={styles.confirmActions}>
                            <button
                                type="button"
                                className={styles.confirmKeep}
                                onClick={() => setConfirmId(null)}
                            >
                                Keep
                            </button>
                            <button
                                type="button"
                                className={styles.confirmDelete}
                                onClick={() => {
                                    remove.mutate(confirmId)
                                    setConfirmId(null)
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}

// ── One clip ──────────────────────────────────────────────────

function ManageRow({
    clip,
    index,
    total,
    isDragging,
    stat,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onNudge,
    onRequestDelete,
}: {
    clip: Highlight
    index: number
    total: number
    isDragging: boolean
    stat?: HighlightStat
    onDragPointerDown: (
        e: React.PointerEvent<HTMLButtonElement>,
        id: string
    ) => void
    onDragPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void
    onDragPointerUp: () => void
    onNudge: (id: string, direction: -1 | 1) => void
    onRequestDelete: () => void
}) {
    const update = useUpdateHighlight()
    const [title, setTitle] = useState(clip.title)

    const visibility: HighlightVisibility =
        clip.visibility ?? "followers_and_recruiters"

    const commitTitle = () => {
        const next = title.trim().slice(0, MAX_TITLE)
        if (next === clip.title) return
        update.mutate({ highlightId: clip.id, payload: { title: next } })
    }

    return (
        <li
            className={`${styles.row} ${isDragging ? styles.rowDragging : ""}`}
            data-clip-id={clip.id}
        >
            {/* Top strip: handle · thumb · order + actions */}
            <div className={styles.rowTop}>
                <button
                    type="button"
                    className={styles.handle}
                    aria-label={`Reorder ${clip.title || "clip"}`}
                    onPointerDown={(e) => onDragPointerDown(e, clip.id)}
                    onPointerMove={onDragPointerMove}
                    onPointerUp={onDragPointerUp}
                    onPointerCancel={onDragPointerUp}
                >
                    <Icon icon="mdi:drag" width={18} height={18} />
                </button>

                <div className={styles.thumbWrap}>
                    {clip.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={clip.thumbnail_url}
                            alt=""
                            className={styles.thumb}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                        />
                    ) : (
                        <span className={styles.thumbFallback} aria-hidden="true">
                            <Icon icon="mdi:video-outline" width={20} height={20} />
                        </span>
                    )}
                    {formatClipDuration(clip.duration) && (
                        <span className={styles.duration}>
                            {formatClipDuration(clip.duration)}
                        </span>
                    )}
                </div>

                <div className={styles.rowTopMeta}>
                    <span className={styles.position}>#{index + 1}</span>

                    {stat && (
                        <div className={styles.clipStats}>
                            <span className={styles.clipStat}>
                                <Icon icon="mdi:play-outline" width={13} height={13} />
                                {stat.views_count} play
                                {stat.views_count === 1 ? "" : "s"}
                            </span>
                            {stat.recruiter_viewers > 0 && (
                                <span
                                    className={`${styles.clipStat} ${styles.clipStatStrong}`}
                                >
                                    <Icon
                                        icon="mdi:account-tie-outline"
                                        width={13}
                                        height={13}
                                    />
                                    {stat.recruiter_viewers} recruiter
                                    {stat.recruiter_viewers === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>
                    )}

                    <div className={styles.rowActions}>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => onNudge(clip.id, -1)}
                        >
                            <Icon icon="mdi:chevron-up" width={18} height={18} />
                        </button>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            aria-label="Move down"
                            disabled={index === total - 1}
                            onClick={() => onNudge(clip.id, 1)}
                        >
                            <Icon icon="mdi:chevron-down" width={18} height={18} />
                        </button>
                        <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            aria-label="Delete clip"
                            onClick={onRequestDelete}
                        >
                            <Icon icon="mdi:trash-can-outline" width={18} height={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Fields: full width on every screen, so nothing is squeezed */}
            <div className={styles.rowFields}>
                <label className={styles.fieldLabel} htmlFor={`title-${clip.id}`}>
                    Title
                </label>
                <div className={styles.titleField}>
                    <input
                        id={`title-${clip.id}`}
                        className={styles.titleInput}
                        value={title}
                        maxLength={MAX_TITLE}
                        placeholder="Add a title (optional)"
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={commitTitle}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                e.currentTarget.blur()
                            }
                            if (e.key === "Escape") {
                                setTitle(clip.title)
                                e.currentTarget.blur()
                            }
                        }}
                    />
                    <span className={styles.counter}>
                        {title.length}/{MAX_TITLE}
                    </span>
                </div>

                <span className={styles.fieldLabel}>Who can watch</span>
                <div
                    className={styles.segmented}
                    role="radiogroup"
                    aria-label="Visibility"
                >
                    {HIGHLIGHT_VISIBILITIES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={visibility === value}
                            className={`${styles.segment} ${
                                visibility === value ? styles.segmentActive : ""
                            }`}
                            onClick={() => {
                                if (visibility === value) return
                                update.mutate({
                                    highlightId: clip.id,
                                    payload: { visibility: value },
                                })
                            }}
                        >
                            <Icon
                                icon={VISIBILITY_META[value].icon}
                                width={14}
                                height={14}
                            />
                            {VISIBILITY_META[value].label}
                        </button>
                    ))}
                </div>
                <p className={styles.explanation}>
                    {VISIBILITY_META[visibility].explanation}
                </p>
            </div>
        </li>
    )
}
