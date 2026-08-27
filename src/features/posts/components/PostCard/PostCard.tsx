"use client"

import { Fragment, memo, useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import MediaCarousel from "@/features/posts/components/MediaCarousel/MediaCarousel"
import PostActions from "@/features/posts/components/PostActions/PostActions"
import PostComments from "@/features/posts/components/PostComments/PostComments"
import PostOptionsSheet from "@/features/posts/components/PostOptionsSheet/PostOptionsSheet"   // ← NEW
import PostLikesModal from "@/features/posts/components/PostLikesModal/PostLikesModal"
import EditPostModal from "@/features/posts/components/EditPostModal/EditPostModal"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { useAuthStore } from "@/store/auth.store"                                               // ← NEW
import type { Post, PostMention } from "@/features/posts/services/posts.api"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import styles from "./PostCard.module.css"
import { useNavigation } from "@/shared/services/navigation.service"

dayjs.extend(relativeTime)

// ── Helpers ───────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const REACTION_META: Record<string, { icon: string; color: string }> = {
  like: { icon: "mdi:lightning-bolt", color: "var(--color-brand)" },
  fire: { icon: "mdi:fire", color: "#FF5E00" },
  respect: { icon: "fluent:hand-wave-24-filled", color: "#FFC83D" },
  funny: { icon: "fluent:emoji-laugh-24-filled", color: "#FFC83D" },
}

function getTopReactions(
  breakdown: Record<string, number> | undefined
): { type: string; icon: string; color: string }[] {
  if (!breakdown) return []
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type]) => ({
      type,
      ...(REACTION_META[type] ?? { icon: "mdi:lightning-bolt", color: "var(--color-brand)" }),
    }))
}

// ── Content with "see more" ───────────────────────────────────

const CONTENT_LIMIT = 220

// POST_CONTENT_LINKIFY — one pass tokenizes both entity kinds
//
// Mirrors posts/services/post_content_service.py (HASHTAG_RE and MENTION_RE),
// so what renders as a link is exactly what the backend parsed out of the same
// body — change one and change the other. Each alternative wraps its WHOLE
// match in a capture group so String.split hands the tokens back interleaved
// with the plain text between them.
//
// The mention branch is letters/digits/underscore for BOTH actor types: users
// and organizations draw from one namespace now, and the dot organizations
// used to allow is gone. "@kochifc." at the end of a sentence still tokenizes
// as "@kochifc" — because the charset stops at the full stop, not because the
// pattern works around it.
// Exported so the charset can be asserted against the backend's in a test
// rather than only in review — this pair has drifted before.
export const CONTENT_SPLIT_RE = /(#[A-Za-z0-9_]{1,50}|@[A-Za-z0-9_]+)/

type ContentSegment =
  | { kind: "text"; key: string; value: string }
  | { kind: "hashtag"; key: string; value: string }
  | { kind: "mention"; key: string; value: string; mention: PostMention }

function splitContent(
  text: string,
  mentions: PostMention[]
): ContentSegment[] {
  // Resolution is the backend's call, not a guess from the text: only handles
  // it actually matched to an account become links. Folded to lowercase
  // because the body can spell the handle in any case.
  const byHandle = new Map(
    mentions.map((mention) => [mention.username.toLowerCase(), mention])
  )

  const segments: ContentSegment[] = []

  text.split(CONTENT_SPLIT_RE).forEach((part, index) => {
    if (!part) return // split() emits "" between adjacent tokens

    // One alternation with one capture ⇒ parts alternate text, token, text, ...
    // The index is a stable key: it only moves when the text itself changes.
    if (index % 2 === 0) {
      segments.push({ kind: "text", key: `t${index}`, value: part })
      return
    }

    if (part.startsWith("#")) {
      segments.push({ kind: "hashtag", key: `h${index}`, value: part })
      return
    }

    const mention = byHandle.get(part.slice(1).toLowerCase())
    segments.push(
      mention
        ? { kind: "mention", key: `m${index}`, value: part, mention }
        : // Unresolved "@nobody" is ordinary prose, not a dead link.
          { kind: "text", key: `t${index}`, value: part }
    )
  })

  return segments
}

export function PostContent({
  text,
  mentions = [],
}: {
  text: string
  mentions?: PostMention[]
}) {
  const [expanded, setExpanded] = useState(false)
  // Routed, not hardcoded: from the org-admin feed these have to stay inside
  // the admin route space or tapping one silently flips back to the personal
  // account. In the user app they resolve to the plain paths either way.
  const { toSearch, toProfile } = useNavigation()

  const isLong = text.length > CONTENT_LIMIT
  const trimmed = isLong ? text.slice(0, CONTENT_LIMIT).replace(/\s+\S*$/, "") : text
  const display = isLong && !expanded ? trimmed + "…" : text

  // The card itself has no click handler today, but these links sit inside
  // PostCard's header/body region — stopping propagation keeps them working if
  // one is ever added above them.
  const stopBubble = (event: React.MouseEvent) => event.stopPropagation()

  return (
    <div className={styles.content}>
      {/* Segments are inline children of the SAME <p>, so the module's
          white-space: pre-wrap still owns line breaks and spacing. */}
      <p className={styles.contentText}>
        {splitContent(display, mentions).map((segment) => {
          if (segment.kind === "hashtag") {
            return (
              <Link
                key={segment.key}
                href={toSearch(segment.value)}
                className={styles.hashtag}
                onClick={stopBubble}
              >
                {segment.value}
              </Link>
            )
          }

          if (segment.kind === "mention") {
            return (
              <Link
                key={segment.key}
                href={toProfile(
                  segment.mention.username,
                  segment.mention.type === "organization" ? "organization" : "user"
                )}
                className={styles.mention}
                onClick={stopBubble}
              >
                {segment.value}
              </Link>
            )
          }

          return <Fragment key={segment.key}>{segment.value}</Fragment>
        })}
      </p>
      {isLong && (
        <button
          className={styles.seeMoreBtn}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          {expanded ? "see less" : "see more"}
        </button>
      )}
    </div>
  )
}


// ── Post card ─────────────────────────────────────────────────

interface PostCardProps {
  post: Post
  queryParams: FetchPostsParams,
  isPreview?: boolean
}

function PostCard({ post, queryParams, isPreview = false }: PostCardProps) {
  const [showComments, setShowComments] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showLikes, setShowLikes] = useState(false)

  const user = useAuthStore((s) => s.user)
  const actorType = useAuthStore((s) => s.actorType)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)

  // Non-null only on a public profile viewed logged out.
  const publicView = usePublicProfile()

  // A post is "own" (deletable/editable) when the ACTIVE actor authored it —
  // the user for their posts, or the active org for its posts. This mirrors the
  // backend, which deletes as the active actor. Never true for a visitor with
  // no session, whatever a stale store happens to hold.
  const isOwn =
    !publicView &&
    (post.author_type === "organization"
      ? actorType === "organization" && currentOrganization?.id === post.author.id
      : actorType === "user" && user?.id === post.author.id)
  const { toProfile } = useNavigation()

  // "Add to Highlights" is offered only for the author's OWN video posts, and
  // only to a player acting as themselves — highlights are personal, so an org
  // actor (even on a post it authored) never sees it. Empty ⇒ the option hides.
  const promotableVideos =
    post.author_type === "user" &&
    actorType === "user" &&
    user?.id === post.author.id &&
    user?.role === "player"
      ? post.media.filter((m) => m.media_type === "video")
      : []

  const timeAgo = dayjs(post.created_at).fromNow()
  const topReactions = getTopReactions(post.likes_breakdown)

  function getAuthorProfileHref(post: Post): string {
    return toProfile(
      post.author.username,
      post.author_type as "user" | "organization"
    )
  }

  return (
    <article className={styles.card}>

      {/* ── Header ── */}
      <div className={styles.cardHeader}>
        <Link href={getAuthorProfileHref(post)} className={styles.authorLink}>
          <Avatar
            src={post.author.profile_photo || post.author.logo}
            initials={post.author.name?.slice(0, 2).toUpperCase()}
            size="md"
          />
          <div className={styles.authorInfo}>
            <span className={styles.authorName}>{post.author.name}</span>
            {post.author.headline && (
              <span className={styles.authorHeadline}>{post.author.headline}</span>
            )}
            <span className={styles.postMeta}>
              {[
                <span key="time" className={styles.timeAgo}>{timeAgo}</span>,
                post.visibility === "followers" && (
                  <Icon key="vis" icon="mdi:account-group-outline" width={12} height={12} />
                ),
                post.location && (
                  <span key="loc" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Icon icon="mdi:map-marker-outline" width={12} height={12} />
                    <span className={styles.locationText}>
                      {post.location.name}{post.location.country_code ? `, ${post.location.country_code}` : ""}
                    </span>
                  </span>
                ),
              ]
                .filter(Boolean)
                .map((item, index, arr) => (
                  <span key={index} className={styles.metaGroup}>
                    {item}
                    {index < arr.length - 1 && <span className={styles.metaDot}>·</span>}
                  </span>
                ))}
            </span>
          </div>
        </Link>

        <div className={styles.headerRight}>
          {/* A post from someone they don't follow has to explain itself, or it
              reads as a bug. Only the feed endpoint sets feed_source, so this
              stays absent on profile/detail renders of the same card. */}
          {post.feed_source && post.feed_source !== "followed" && (
            <span className={styles.suggestedChip}>
              <Icon icon="mdi:compass-outline" width={12} height={12} aria-hidden="true" />
              <span>Suggested</span>
            </span>
          )}

          {/* ── More button — opens options sheet ──
              Every action inside that sheet (save, promote to highlight, edit,
              delete, report) needs an account, so on a public profile the button
              opens the login wall rather than a sheet of dead options. */}
          <button
            className={styles.moreBtn}
            type="button"
            aria-label="More options"
            onClick={() =>
              publicView
                ? publicView.openLoginWall("save posts from")
                : setShowOptions(true)
            }
          >
            <Icon icon="mdi:dots-horizontal" width={20} height={20} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <PostContent text={post.content} mentions={post.mentions ?? []} />

      {/* ── Media ── */}
      {post.media.length > 0 && (
        <div className={styles.mediaWrap}>
          <MediaCarousel media={post.media} postId={post.id} />
        </div>
      )}

      {/* ── Stats row ── */}
      {(post.likes_count > 0 || post.comments_count > 0) && (
        <div className={styles.statsRow}>
          {post.likes_count > 0 && (
            <button
              type="button"
              className={`${styles.statItem} ${styles.likesBtn}`}
              onClick={() => setShowLikes(true)}
              aria-label={`View ${post.likes_count} reactions`}
            >
              <span className={styles.reactionIcons}>
                {topReactions.length > 0
                  ? topReactions.map((r) => (
                    <span key={r.type} className={styles.reactionIconBubble} title={r.type}>
                      <Icon icon={r.icon} width={13} height={13} color={r.color} />
                    </span>
                  ))
                  : (
                    <span className={styles.reactionIconBubble}>
                      <Icon icon="mdi:lightning-bolt" width={11} height={11} color="var(--color-brand)" />
                    </span>
                  )}
              </span>
              <span className={styles.statCount}>{fmtCount(post.likes_count)}</span>
            </button>
          )}
          {post.comments_count > 0 && (
            <button
              className={`${styles.statItem} ${styles.statItemBtn}`}
              onClick={() => setShowComments(!showComments)}
            >
              {fmtCount(post.comments_count)} comment{post.comments_count !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <PostActions
        post={post}
        queryParams={queryParams}
        onCommentClick={() => setShowComments(!showComments)}
      />

      {/* ── Comments (bottom sheet / desktop modal) ── */}
      {showComments && (
        <PostComments
          postId={post.id}
          commentsCount={post.comments_count}
          isPostOwner={isOwn}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* ── Options sheet ── */}
      {showOptions && (
        <PostOptionsSheet
          postId={post.id}
          isOwn={isOwn}
          isPreview={isPreview}
          isSaved={post.is_saved ?? false}
          promotableVideos={promotableVideos}
          onClose={() => setShowOptions(false)}
          onEdit={() => setShowEdit(true)}
          author={{
            id: post.author.id,
            username: post.author.username,
            name: post.author.name,
            // author_type is the server's string; anything not "organization"
            // is a person, which is also the safe default for old payloads.
            type:
              post.author_type === "organization" ? "organization" : "user",
          }}
        />
      )}

      {/* ── Edit modal ── */}
      {showEdit && (
        <EditPostModal post={post} onClose={() => setShowEdit(false)} />
      )}

      {/* ── Reactions list modal ── */}
      {showLikes && (
        <PostLikesModal
          postId={post.id}
          totalCount={post.likes_count}
          onClose={() => setShowLikes(false)}
        />
      )}

    </article>
  )
}

// Memoized: in the infinite feeds the `post` reference is stable across page
// appends (React Query structural sharing) and callers pass a stable
// `queryParams`, so existing cards skip re-render when a new page loads. A
// caller that passes a fresh queryParams object each render defeats this — keep
// those references stable at the call site.
export default memo(PostCard)