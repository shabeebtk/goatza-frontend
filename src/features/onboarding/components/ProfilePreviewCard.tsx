"use client"

import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import type { UserProfile } from "@/features/profile/services/profile.api"
import styles from "./ProfilePreviewCard.module.css"

/**
 * Non-interactive preview of the profile header, mirroring how a visitor sees the
 * real profile page (same tokens/patterns as UserProfile) — the real component is
 * too page-coupled (posts, follow, edit modals, routing) to drop in here. The only
 * live bits are the avatar/cover, which open the photo editor. The Follow/Message
 * buttons are decorative (they show how others will see the profile).
 */
export default function ProfilePreviewCard({
  profile,
  onEditPhoto,
}: {
  profile: UserProfile
  onEditPhoto: (type: "profile" | "cover") => void
}) {
  const sport = profile.primary_sport

  return (
    <div className={styles.card}>
      {/* ── Cover ── */}
      <div className={styles.coverWrap}>
        {profile.cover_photo ? (
          <img src={profile.cover_photo} alt="Cover" className={styles.coverImg} />
        ) : (
          <div className={styles.coverFallback} aria-hidden="true">
            <Icon icon="mdi:soccer" width={64} height={64} />
          </div>
        )}
        <div className={styles.coverOverlay} aria-hidden="true" />
        <button
          type="button"
          className={styles.coverBtn}
          onClick={() => onEditPhoto("cover")}
          aria-label={profile.cover_photo ? "Change cover photo" : "Add cover photo"}
        >
          <Icon icon="mdi:camera-plus-outline" width={16} height={16} />
          <span>{profile.cover_photo ? "Change cover" : "Add cover"}</span>
        </button>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        <div className={styles.avatarRow}>
          <button
            type="button"
            className={styles.avatarBtn}
            onClick={() => onEditPhoto("profile")}
            aria-label={profile.profile_photo ? "Change profile photo" : "Add profile photo"}
          >
            <Avatar
              src={profile.profile_photo}
              initials={profile.name?.slice(0, 2).toUpperCase()}
              size="xl"
              className={styles.avatar}
            />
            <span className={styles.avatarOverlay} aria-hidden="true">
              <Icon icon="mdi:camera-outline" width={20} height={20} />
            </span>
          </button>
        </div>

        {/* Name + username + badges */}
        <div className={styles.nameBlock}>
          <h3 className={styles.name}>{profile.name || "Your name"}</h3>
          <span className={styles.username}>@{profile.username}</span>

          <div className={styles.badgesRow}>
            {sport && (
              <>
                <span className={styles.badge}>
                  {sport.icon_name && <Icon icon={sport.icon_name} width={13} height={13} />}
                  {sport.sport}
                </span>
                {sport.primary_position && (
                  <span className={styles.badge}>{sport.primary_position}</span>
                )}
              </>
            )}
            {profile.location && (
              <span className={styles.badge}>
                <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                {profile.location.name}
                {profile.location.country_code ? `, ${profile.location.country_code}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Headline */}
        {profile.headline && <p className={styles.headline}>{profile.headline}</p>}

        {/* Dummy action buttons — how visitors will see the profile. Non-interactive
            (tabIndex -1, no handlers), styled exactly like the real profile page. */}
        <div className={styles.actions}>
          <span className={styles.actionFull}>
            <Button
              variant="brand"
              size="sm"
              fullWidth
              tabIndex={-1}
              leftIcon={<Icon icon="mdi:plus" width={15} height={15} />}
            >
              Follow
            </Button>
          </span>
          <span className={styles.actionFull}>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              tabIndex={-1}
              leftIcon={<Icon icon="mdi:message-outline" width={15} height={15} />}
            >
              Message
            </Button>
          </span>
          <Button variant="ghost" size="sm" iconOnly tabIndex={-1} aria-label="More options">
            <Icon icon="mdi:dots-horizontal" width={18} height={18} />
          </Button>
        </div>
      </div>
    </div>
  )
}
