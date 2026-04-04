"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import PhotoEditModal from "@/features/profile/components/PhotoEditModal/PhotoEditModal"
import {
  useUserProfile,
  useUpdateProfile,
  useFollowUser,
} from "@/features/profile/hooks/useProfileQueries"
import styles from "./UserProfile.module.css"

// ── Stat pill ─────────────────────────────────────────────────
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.statPill}>
      <span className={styles.statValue}>{Number(value).toLocaleString()}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

// ── Edit icon button ──────────────────────────────────────────
function EditBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className={styles.editIconBtn} onClick={onClick} aria-label={label} type="button">
      <Icon icon="mdi:pencil-outline" width={15} height={15} />
    </button>
  )
}

// ── Inline edit ───────────────────────────────────────────────
function InlineEdit({
  value, onSave, onCancel, placeholder, multiline = false, maxLength = 160,
}: {
  value: string; onSave: (v: string) => void; onCancel: () => void
  placeholder?: string; multiline?: boolean; maxLength?: number
}) {
  const [draft, setDraft] = useState(value)
  const shared = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    placeholder, maxLength, className: styles.inlineInput, autoFocus: true as const,
  }
  return (
    <div className={styles.inlineEditWrap}>
      {multiline
        ? <textarea rows={4} {...shared} />
        : <input type="text" {...(shared as React.InputHTMLAttributes<HTMLInputElement>)} />}
      <div className={styles.inlineEditActions}>
        <button className={styles.inlineSave} onClick={() => onSave(draft.trim())} type="button">Save</button>
        <button className={styles.inlineCancel} onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

// ── Follow button ─────────────────────────────────────────────
function FollowButton({ profileId, username, isFollowing, isFollowedBy }: {
  profileId: string; username: string; isFollowing: boolean; isFollowedBy: boolean
}) {
  const { follow, unfollow } = useFollowUser(username)
  const loading = follow.isPending || unfollow.isPending
  const handleClick = () => isFollowing ? unfollow.mutate(profileId) : follow.mutate(profileId)

  const label = isFollowing ? "Following" : isFollowedBy ? "Follow Back" : "Follow"
  const icon = isFollowing ? "mdi:check" : "mdi:plus"
  const variant = isFollowing ? "outline" : "brand"

  return (
    <Button variant={variant} size="sm" loading={loading} onClick={handleClick}
      leftIcon={<Icon icon={icon} width={15} height={15} />}
      className={isFollowing ? styles.followingBtn : undefined}>
      {label}
    </Button>
  )
}

// ── Main component ────────────────────────────────────────────
interface UserProfileProps {
  username: string
  isOwn?: boolean
}

// Which photo modal is open — null means none
type PhotoModalType = "profile" | "cover" | null

export default function UserProfile({ username, isOwn = false }: UserProfileProps) {
  const { data: profile, isLoading, isError } = useUserProfile(username)
  const updateProfile = useUpdateProfile()

  const [editing, setEditing] = useState<null | "name" | "headline" | "about">(null)
  // ↓ NEW: controls which photo modal is open
  const [photoModal, setPhotoModal] = useState<PhotoModalType>(null)

  // ── Skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.profileSkeleton}>
        <div className={`${styles.skeletonBlock} ${styles.skeletonCover}`} />
        <div className={styles.skeletonBody}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonLineSm}`} />
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className={styles.profileError}>
        <Icon icon="mdi:account-off-outline" width={48} height={48} />
        <p>Profile not found.</p>
      </div>
    )
  }

  const rel = profile.relationship
  const isMe = isOwn || (rel?.is_me ?? false)

  const handleSave = async (field: "name" | "headline" | "about", value: string) => {
    await updateProfile.mutateAsync({ [field]: value })
    setEditing(null)
  }

  const joined = new Date(profile.created_at).toLocaleDateString("en-IN", {
    month: "long", year: "numeric",
  })

  return (
    <>
      <div className={styles.profilePage}>
        <div className={styles.profileCard}>

          {/* ── Cover photo ── */}
          <div className={styles.coverWrap}>
            {profile.cover_photo ? (
              <img src={profile.cover_photo} alt="Cover" className={styles.coverImg} />
            ) : (
              <div className={styles.coverFallback} aria-hidden="true">
                <Icon icon="mdi:soccer" width={80} height={80} />
              </div>
            )}
            <div className={styles.coverOverlay} aria-hidden="true" />

            {/* ↓ CHANGED: button opens modal instead of hidden file input */}
            {isMe && (
              <button
                className={styles.coverEditBtn}
                onClick={() => setPhotoModal("cover")}
                aria-label="Change cover photo"
                type="button"
              >
                <Icon icon="mdi:camera-plus-outline" width={18} height={18} />
                <span>Change Cover</span>
              </button>
            )}

            {/* View-only click for other users — opens cover in lightbox */}
            {!isMe && profile.cover_photo && (
              <button
                className={styles.coverViewBtn}
                onClick={() => setPhotoModal("cover")}
                aria-label="View cover photo"
                type="button"
              >
                <Icon icon="mdi:fullscreen" width={18} height={18} />
              </button>
            )}
          </div>

          {/* ── Profile body ── */}
          <div className={styles.profileBody}>

            {/* Avatar + actions row */}
            <div className={styles.avatarRow}>
              <div className={styles.avatarWrap}>
                {/* ↓ CHANGED: clicking avatar opens modal */}
                <button
                  className={styles.avatarClickWrap}
                  onClick={() => {
                    if (!isMe) return
                    setPhotoModal("profile")
                  }}
                  disabled={!isMe}
                  aria-label={isMe ? "Change profile photo" : "View profile photo"}
                  type="button"
                >
                  <Avatar
                    src={profile.profile_photo}
                    initials={profile.name?.slice(0, 2).toUpperCase()}
                    size="xl"
                    className={styles.profileAvatar}
                  />
                  {isMe && (
                    <span className={styles.avatarEditOverlay} aria-hidden="true">
                      <Icon icon="mdi:camera-outline" width={22} height={22} />
                    </span>
                  )}
                </button>
              </div>

              <div className={styles.profileActions}>
                {isMe ? (
                  <>
                    <Button variant="outline" size="sm" href="/settings/profile"
                      leftIcon={<Icon icon="mdi:cog-outline" width={15} height={15} />}>
                      Edit Profile
                    </Button>
                    <Button variant="ghost" size="sm" iconOnly aria-label="Share profile">
                      <Icon icon="mdi:share-variant-outline" width={18} height={18} />
                    </Button>
                  </>
                ) : (
                  <>
                    {rel && (
                      <FollowButton
                        profileId={profile.id}
                        username={profile.username}
                        isFollowing={rel.is_following}
                        isFollowedBy={rel.is_followed_by}
                      />
                    )}
                    {rel?.is_followed_by && !rel.is_following && (
                      <span className={styles.followsYouChip}>Follows you</span>
                    )}
                    <Button variant="outline" size="sm"
                      leftIcon={<Icon icon="mdi:message-outline" width={15} height={15} />}>
                      Message
                    </Button>
                    <Button variant="ghost" size="sm" iconOnly aria-label="More options">
                      <Icon icon="mdi:dots-horizontal" width={18} height={18} />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div className={styles.nameBlock}>
              <div className={styles.nameRow}>
                {editing === "name" ? (
                  <InlineEdit value={profile.name} placeholder="Your name"
                    onSave={(v) => handleSave("name", v)} onCancel={() => setEditing(null)} maxLength={60} />
                ) : (
                  <>
                    <h1 className={styles.profileName}>{profile.name}</h1>
                    {isMe && <EditBtn onClick={() => setEditing("name")} label="Edit name" />}
                  </>
                )}
              </div>
              <span className={styles.profileUsername}>@{profile.username}</span>

              {/* Sport + position badge */}
              {profile.primary_sport && (
                <div className={styles.roleBadge}>
                  <Icon icon={profile.primary_sport.icon_name} width={13} height={13} />
                  {profile.primary_sport.sport}
                  {profile.primary_sport.primary_position && (
                    <>
                      <span className={styles.roleBadgeSep}>·</span>
                      {profile.primary_sport.primary_position}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Headline */}
            <div className={styles.headlineBlock}>
              {editing === "headline" ? (
                <InlineEdit value={profile.headline ?? ""} placeholder="e.g. Striker | Football Enthusiast"
                  onSave={(v) => handleSave("headline", v)} onCancel={() => setEditing(null)} maxLength={120} />
              ) : (
                <div className={styles.headlineRow}>
                  <p className={styles.profileHeadline}>
                    {profile.headline || (isMe ? "Add a headline…" : "")}
                  </p>
                  {isMe && <EditBtn onClick={() => setEditing("headline")} label="Edit headline" />}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
              <StatPill value={profile.followers_count} label="Followers" />
              <div className={styles.statDivider} />
              <StatPill value={profile.following_count} label="Following" />
              <div className={styles.statDivider} />
              <StatPill value={profile.connections_count} label="Connections" />
            </div>

            {/* Meta */}
            <div className={styles.metaRow}>
              {profile.is_email_verified && (
                <span className={`${styles.metaChip} ${styles.metaChipVerified}`}>
                  <Icon icon="mdi:check-decagram" width={14} height={14} />
                  Verified
                </span>
              )}
              <span className={styles.metaChip}>
                <Icon icon="mdi:calendar-outline" width={13} height={13} />
                Joined {joined}
              </span>
            </div>

            <div className={styles.sectionDivider} />

            {/* About */}
            <div className={styles.aboutBlock}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>About</h2>
                {isMe && <EditBtn onClick={() => setEditing("about")} label="Edit about" />}
              </div>
              {editing === "about" ? (
                <InlineEdit value={profile.about ?? ""} placeholder="Tell the world about yourself…"
                  onSave={(v) => handleSave("about", v)} onCancel={() => setEditing(null)}
                  multiline maxLength={600} />
              ) : (
                <p className={styles.aboutText}>
                  {profile.about || (
                    isMe
                      ? <span className={styles.emptyHint}>Add a bio to let scouts know who you are…</span>
                      : <span className={styles.emptyHint}>No bio yet.</span>
                  )}
                </p>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Photo modal — rendered outside profileCard so it's truly full-screen ── */}
      {photoModal && isMe && (
        <PhotoEditModal
          type={photoModal}
          currentSrc={photoModal === "profile" ? profile.profile_photo : profile.cover_photo}
          username={profile.username}
          // isOwn={isMe}
          onClose={() => setPhotoModal(null)}
        />
      )}
    </>
  )
}