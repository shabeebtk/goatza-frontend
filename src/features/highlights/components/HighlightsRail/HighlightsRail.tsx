"use client"

/**
 * HighlightsRail — the 9:16 thumbnail strip on a player's profile
 * (HIGHLIGHTS_SPEC.md §3).
 *
 * Images ONLY: the rail is a row of poster frames, never <video> elements, so
 * it paints as fast as any photo grid. Offscreen tiles lazy-load.
 *
 * Who sees what:
 *   - owner (player, acting as themselves) → "+" tile first, then their clips
 *   - anyone else → only the clips the API decided they may see
 *   - nobody with 0 visible clips → nothing at all, no empty section
 */

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { usePublicSection } from "@/features/profile/context/PublicProfileContext"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import { useHighlights } from "../../hooks/useHighlights"
import { MAX_HIGHLIGHTS, type Highlight } from "../../types"
import { formatClipDuration } from "../../visibilityMeta"
import AddHighlightModal from "../AddHighlightModal/AddHighlightModal"
import HighlightViewer, {
    type HighlightViewerOwner,
} from "../HighlightViewer/HighlightViewer"
import styles from "./HighlightsRail.module.css"

type HighlightsRailProps = {
    /** Profile being viewed. */
    owner: HighlightViewerOwner
    /** The logged-in person is this profile. */
    isOwn?: boolean
}

export default function HighlightsRail({
    owner,
    isOwn = false,
}: HighlightsRailProps) {
    const role = useAuthStore((s) => s.user?.role)
    const actorType = useAuthStore((s) => s.actorType)
    const { toHighlightsManage } = useNavigation()

    const [viewerIndex, setViewerIndex] = useState<number | null>(null)
    const [addOpen, setAddOpen] = useState(false)

    // On a public profile the rail arrived with the server-rendered bundle,
    // already filtered to the clips a logged-out viewer may see — the backend
    // runs the same visibility matrix with actor=None. Passing null disables
    // the query (IsAuthenticated) rather than 401-ing under a correct section.
    //
    // Restricted clips are simply ABSENT from that list. No client-side filter
    // and no "locked" placeholder: a placeholder advertises that hidden footage
    // exists, which is the one thing recruiters_only is meant to avoid.
    const publicClips = usePublicSection<Highlight>("highlights")

    const { data, isLoading: isFetching } = useHighlights(
        publicClips ? null : owner.username
    )

    const clips = publicClips ?? data?.results ?? []
    const isLoading = publicClips ? false : isFetching

    // Writes are players-only, acting as themselves — an org actor on their own
    // profile gets the read-only rail (the API would reject the write anyway).
    const canManage = isOwn && role === "player" && actorType === "user"

    // Non-owners with nothing to see get no section at all — not an empty one.
    // Also stay silent on the first load so the profile never flashes a rail
    // that turns out to be empty.
    if (!canManage && (clips.length === 0 || isLoading)) return null

    return (
        <section className={styles.section} aria-label="Highlights">
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <Icon icon="mdi:play-box-outline" width={16} height={16} />
                    Highlights
                    {clips.length > 0 && (
                        <span className={styles.count}>{clips.length}</span>
                    )}
                </h2>

                {canManage && (
                    <Link href={toHighlightsManage()} className={styles.manageBtn}>
                        <Icon icon="mdi:tune-variant" width={15} height={15} />
                        Manage
                        <span className={styles.manageSlots}>
                            {clips.length}/{MAX_HIGHLIGHTS}
                        </span>
                    </Link>
                )}
            </div>

            <div className={styles.rail}>
                {canManage && (
                    <button
                        type="button"
                        className={styles.addTile}
                        onClick={() => setAddOpen(true)}
                        disabled={clips.length >= MAX_HIGHLIGHTS}
                        aria-label="Add a highlight"
                        title={
                            clips.length >= MAX_HIGHLIGHTS
                                ? `You already have ${MAX_HIGHLIGHTS} highlights`
                                : "Add a highlight"
                        }
                    >
                        <Icon icon="mdi:plus" width={24} height={24} />
                        <span className={styles.addLabel}>Add clip</span>
                    </button>
                )}

                {clips.map((clip, i) => (
                    <button
                        key={clip.id}
                        type="button"
                        className={styles.tile}
                        onClick={() => setViewerIndex(i)}
                        aria-label={
                            clip.title
                                ? `Play highlight: ${clip.title}`
                                : `Play highlight ${i + 1}`
                        }
                    >
                        {clip.thumbnail_url ? (
                            // Plain <img>: the rail must load like images. next/image
                            // isn't used anywhere for stored media in this app.
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
                                <Icon icon="mdi:video-outline" width={22} height={22} />
                            </span>
                        )}

                        <span className={styles.playDot} aria-hidden="true">
                            <Icon icon="mdi:play" width={14} height={14} />
                        </span>

                        {formatClipDuration(clip.duration) && (
                            <span className={styles.duration}>
                                {formatClipDuration(clip.duration)}
                            </span>
                        )}

                        {clip.title && (
                            <span className={styles.tileTitle}>{clip.title}</span>
                        )}
                    </button>
                ))}
            </div>

            {canManage && clips.length === 0 && (
                <p className={styles.hint}>
                    Add up to {MAX_HIGHLIGHTS} short clips (max 90s each) — recruiters
                    watch these first.
                </p>
            )}

            {addOpen && <AddHighlightModal onClose={() => setAddOpen(false)} />}

            {viewerIndex !== null && clips.length > 0 && (
                <HighlightViewer
                    clips={clips}
                    startIndex={viewerIndex}
                    owner={owner}
                    isOwner={canManage}
                    onClose={() => setViewerIndex(null)}
                />
            )}
        </section>
    )
}
