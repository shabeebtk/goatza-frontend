"use client"

/**
 * ViewerCaption — the phone viewer's bottom-left overlay: who posted, the
 * caption, where.
 *
 * The caption is clamped to two LINES (not characters — PostContent's own
 * 220-character fold is switched off here) with a "more" that expands it in
 * place; a long caption then scrolls inside ~40% of the screen rather than
 * pushing the author off the top.
 *
 * A text-only post shows its words on the card itself (ViewerTextPost), so
 * its overlay is the author row and the location only: `showText={false}`.
 */

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { PostContent } from "@/features/posts/components/PostCard/PostCard"
import type { Post } from "@/features/posts/services/posts.api"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./ViewerCaption.module.css"

interface ViewerCaptionProps {
  post: Post
  /** False on a text post: the words are already on the card. */
  showText?: boolean
}

export default function ViewerCaption({ post, showText = true }: ViewerCaptionProps) {
  const { toProfile } = useNavigation()
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const clampRef = useRef<HTMLDivElement>(null)

  const href = toProfile(
    post.author.username,
    post.author_type === "organization" ? "organization" : "user"
  )

  // Only offer "more" when the clamp actually hides something. Measured
  // after layout — a caption that fits in two lines gets no button.
  useLayoutEffect(() => {
    const el = clampRef.current
    if (!el || expanded) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [post.content, expanded])

  return (
    <div className={styles.caption}>
      <Link href={href} className={styles.author}>
        <Avatar
          src={post.author.profile_photo || post.author.logo}
          initials={post.author.name?.slice(0, 2).toUpperCase()}
          size="sm"
        />
        <span className={styles.authorText}>
          <span className={styles.authorName}>{post.author.name}</span>
          {post.author.headline && (
            <span className={styles.authorHeadline}>{post.author.headline}</span>
          )}
        </span>
      </Link>

      {showText && post.content && (
        <div className={styles.captionRow}>
          <div
            ref={clampRef}
            className={`${styles.text} ${expanded ? styles.textExpanded : styles.textClamped}`}
          >
            <PostContent
              text={post.content}
              mentions={post.mentions ?? []}
              limit={Infinity}
              className={styles.content}
            />
          </div>
          {(overflows || expanded) && (
            <button
              type="button"
              className={styles.moreBtn}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}

      {post.location && (
        <span className={styles.location}>
          <Icon icon="mdi:map-marker-outline" width={13} height={13} aria-hidden="true" />
          <span className={styles.locationText}>
            {post.location.name}
            {post.location.country_code ? `, ${post.location.country_code}` : ""}
          </span>
        </span>
      )}
    </div>
  )
}
