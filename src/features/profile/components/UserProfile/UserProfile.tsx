"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import PhotoEditModal from "@/features/profile/components/PhotoEditModal/PhotoEditModal"
import EditProfileModal from "@/features/profile/components/EditProfileModal/EditProfileModal"
import {
  useUserProfile,
  useFollowUser,
} from "@/features/profile/hooks/useProfileQueries"
import type { UserProfile } from "@/features/profile/services/profile.api"
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

// ── Follow button ─────────────────────────────────────────────
function FollowButton({
  profileId, username, isFollowing, isFollowedBy,
}: {
  profileId: string; username: string; isFollowing: boolean; isFollowedBy: boolean
}) {
  const { follow, unfollow } = useFollowUser(username)
  const loading = follow.isPending || unfollow.isPending
  const handleClick = () =>
    isFollowing ? unfollow.mutate(profileId) : follow.mutate(profileId)

  const label   = isFollowing ? "Following" : isFollowedBy ? "Follow Back" : "Follow"
  const icon    = isFollowing ? "mdi:check"  : "mdi:plus"
  const variant: "brand" | "outline" = isFollowing ? "outline" : "brand"

  return (
    <Button
      variant={variant}
      size="sm"
      loading={loading}
      onClick={handleClick}
      leftIcon={<Icon icon={icon} width={15} height={15} />}
      className={isFollowing ? styles.followingBtn : undefined}
    >
      {label}
    </Button>
  )
}

// ── Main ─────────────────────────────────────────────────────
interface UserProfileProps {
  username: string
  isOwn?: boolean
}

type PhotoModalType = "profile" | "cover" | null

export default function UserProfile({ username, isOwn = false }: UserProfileProps) {
  const router = useRouter()
  const { data: profile, isLoading, isError } = useUserProfile(username)

  const [photoModal, setPhotoModal]         = useState<PhotoModalType>(null)
  const [editProfileOpen, setEditProfileOpen] = useState(false)

  // After save: redirect if username changed, otherwise just close
  const handleProfileSaved = (updated: UserProfile) => {
    setEditProfileOpen(false)
    if (updated.username !== username) {
      router.replace(`/profile/${updated.username}`)
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────
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

  const rel  = profile.relationship
  const isMe = isOwn || (rel?.is_me ?? false)

  const joined = new Date(profile.created_at).toLocaleDateString("en-IN", {
    month: "long", year: "numeric",
  })

  return (
    <>
      <div className={styles.profilePage}>
        <div className={styles.profileCard}>

          {/* ── Cover ── */}
          <div className={styles.coverWrap}>
            {profile.cover_photo ? (
              <img src={profile.cover_photo} alt="Cover" className={styles.coverImg} />
            ) : (
              <div className={styles.coverFallback} aria-hidden="true">
                <Icon icon="mdi:soccer" width={80} height={80} />
              </div>
            )}
            <div className={styles.coverOverlay} aria-hidden="true" />

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

          {/* ── Body ── */}
          <div className={styles.profileBody}>

            {/* Avatar + action buttons */}
            <div className={styles.avatarRow}>
              <div className={styles.avatarWrap}>
                <button
                  className={styles.avatarClickWrap}
                  onClick={() => setPhotoModal("profile")}
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
                    {/* SINGLE edit button — opens modal */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditProfileOpen(true)}
                      leftIcon={<Icon icon="mdi:pencil-outline" width={15} height={15} />}
                    >
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
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Icon icon="mdi:message-outline" width={15} height={15} />}
                    >
                      Message
                    </Button>
                    <Button variant="ghost" size="sm" iconOnly aria-label="More options">
                      <Icon icon="mdi:dots-horizontal" width={18} height={18} />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Name + username + sport badge — read-only now */}
            <div className={styles.nameBlock}>
              <h1 className={styles.profileName}>{profile.name}</h1>
              <span className={styles.profileUsername}>@{profile.username}</span>

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

            {/* Headline — read-only */}
            {profile.headline ? (
              <p className={styles.profileHeadline}>{profile.headline}</p>
            ) : isMe ? (
              <p className={styles.profileHeadlineEmpty}>
                Add a headline — click Edit Profile
              </p>
            ) : null}

            {/* Stats */}
            <div className={styles.statsRow}>
              <StatPill value={profile.followers_count}   label="Followers"   />
              <div className={styles.statDivider} />
              <StatPill value={profile.following_count}   label="Following"   />
              <div className={styles.statDivider} />
              <StatPill value={profile.connections_count} label="Connections" />
            </div>

            {/* Meta chips */}
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

            {/* About */}
            {(profile.about || isMe) && (
              <>
                <div className={styles.sectionDivider} />
                <div className={styles.aboutBlock}>
                  <h2 className={styles.sectionTitle}>About</h2>
                  {profile.about ? (
                    <p className={styles.aboutText}>{profile.about}</p>
                  ) : (
                    <p className={styles.emptyHint}>
                      Add a bio — click Edit Profile above.
                    </p>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* ── Photo modal ── */}
      {photoModal && (
        <PhotoEditModal
          type={photoModal}
          currentSrc={photoModal === "profile" ? profile.profile_photo : profile.cover_photo}
          username={profile.username}
          isOwn={isMe}
          onClose={() => setPhotoModal(null)}
        />
      )}

      {/* ── Edit profile modal — only for own profile ── */}
      {editProfileOpen && isMe && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditProfileOpen(false)}
          onSaved={handleProfileSaved}
        />
      )}
    </>
  )
}