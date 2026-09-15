"use client"

/**
 * ViewerTextPost — a post with no media, shown in the viewer as big text on
 * a dark card. Fills the phone page (under the top bar, the author row and
 * the rail) or the desktop stage.
 *
 * A text post is never what OPENS the viewer — only a photo or video does —
 * it is what the reader swipes onto between them. So it shares the media
 * slide's gestures: a double-tap likes (useDoubleTap, the same timing), and
 * on the phone the vertical swipe still belongs to the reels track.
 *
 * The size comes from textPost.ts: short Latin text gets the display font
 * with a bolt above it; anything longer, or in a script Bebas Neue has no
 * glyphs for, gets the body font at a reading size. The phone clamps a long
 * post to its area with a "Read more" that turns the area into a scroll
 * box; desktop shows everything in a scrolling box of its own.
 */

import { useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from "react"
import { Icon } from "@iconify/react"
import { PostContent } from "@/features/posts/components/PostCard/PostCard"
import type { Post } from "@/features/posts/services/posts.api"
import LikeBurst from "./LikeBurst"
import { shouldWheelNavigate, splitTrailingHashtags, textPostSize } from "./textPost"
import { useDoubleTap } from "./useDoubleTap"
import styles from "./ViewerTextPost.module.css"

interface ViewerTextPostProps {
  post: Post
  layout: "phone" | "desktop"
  /** The post on screen. The phone keeps neighbours mounted; they are inert. */
  active: boolean
  /** Double-tap / double-click: like. */
  onDoubleTap: () => void
  /** Non-zero replays the bolt — already scoped to this post by the layout. */
  burstKey: number
}

const SIZE_CLASS = {
  "display-xl": "sizeDisplayXl",
  "display-lg": "sizeDisplayLg",
  "body-lg": "sizeBodyLg",
  body: "sizeBody",
} as const

/** A tap on a control or a link is that control's, never half a double-tap. */
function isControl(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el && typeof el.closest === "function" && el.closest("a, button"))
}

export default function ViewerTextPost({
  post,
  layout,
  active,
  onDoubleTap,
  burstKey,
}: ViewerTextPostProps) {
  const isPhone = layout === "phone"
  const text = post.content
  const size = useMemo(() => textPostSize(text), [text])
  const isDisplay = size === "display-xl" || size === "display-lg"

  // Only the display sizes pull the trailing hashtags onto their own line:
  // at body sizes the tags read fine where the author put them.
  const { body, tags } = useMemo(
    () => (isDisplay ? splitTrailingHashtags(text) : { body: text, tags: "" }),
    [text, isDisplay]
  )

  const boxRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Back to the clamp whenever this stops being the active post — the page
  // stays mounted as a neighbour, and swiping back should find it folded.
  const [wasActive, setWasActive] = useState(active)
  if (wasActive !== active) {
    setWasActive(active)
    if (!active) setExpanded(false)
  }

  // Phone only: offer "Read more" when the clamp actually hides something.
  // Measured after layout, the way ViewerCaption does — a post that fits
  // gets no button.
  useLayoutEffect(() => {
    if (!isPhone || expanded) return
    const el = boxRef.current
    if (!el) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [isPhone, expanded, text, active])

  const tap = useDoubleTap({ onDoubleTap })
  const onClick = (e: React.MouseEvent) => {
    if (isControl(e.target)) return
    tap()
  }

  // Desktop: a wheel tick the text box can still scroll by is the reader
  // scrolling the text — keep it from the stage, whose wheel changes post.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (isPhone) return
    const el = e.currentTarget
    const navigate = shouldWheelNavigate({
      deltaY: e.deltaY,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    })
    if (!navigate) e.stopPropagation()
  }

  const boxClass = [
    styles.box,
    styles[SIZE_CLASS[size]],
    isPhone && !expanded ? styles.boxClamped : "",
    isPhone && !expanded && overflows ? styles.boxCut : "",
    isPhone && expanded ? styles.boxExpanded : "",
  ].join(" ")

  return (
    <div
      className={`${styles.root} ${isPhone ? styles.phone : styles.desktop}`}
      onClick={onClick}
      data-viewer-text=""
      data-viewer-active={active ? "" : undefined}
    >
      <div className={`${styles.area} ${isDisplay ? styles.areaDisplay : styles.areaBody}`}>
        {/* dir="auto": the first strong character decides, so Arabic or
            Urdu runs right-to-left without the caller knowing the script. */}
        <div ref={boxRef} className={boxClass} dir="auto" onWheel={onWheel}>
          {isDisplay && (
            <Icon
              icon="mdi:lightning-bolt"
              className={styles.bolt}
              width={isPhone ? 28 : 36}
              height={isPhone ? 28 : 36}
              aria-hidden="true"
            />
          )}

          <PostContent
            text={body}
            mentions={post.mentions ?? []}
            limit={Infinity}
            className={styles.content}
          />

          {tags && (
            <PostContent
              text={tags}
              mentions={[]}
              limit={Infinity}
              className={styles.tags}
            />
          )}
        </div>

        {isPhone && (overflows || expanded) && (
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {active && burstKey > 0 && <LikeBurst key={burstKey} />}
    </div>
  )
}
