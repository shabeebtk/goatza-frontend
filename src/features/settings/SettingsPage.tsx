"use client"

/**
 * SettingsPage — the account menu.
 *
 * Deliberately a list of sections of rows rather than bespoke blocks: every
 * new setting is one <SettingsRow> in the right section, and a section that
 * has no rows yet renders nothing at all. The org-admin menu
 * (OrgSettingsPage) is built from the same pieces.
 */

import { BackHeader } from "@/shared/components/ui"
import { useLogout } from "@/features/auth/hooks/useLogout"
import { useMyProfile } from "@/features/profile/hooks/useProfileQueries"
import { profileUrl } from "@/shared/services/profileUrl"
import { useTogglePublicProfile } from "./hooks/usePrivacySettings"
import ProfileLinkRow from "./components/SettingsMenu/ProfileLinkRow"
import {
  SettingsActionRow,
  SettingsRow,
  SettingsSection,
  SettingsToggleRow,
} from "./components/SettingsMenu/SettingsMenu"
import styles from "./SettingsPage.module.css"

export default function SettingsPage() {
  const logout = useLogout()
  const { data: profile } = useMyProfile()
  const togglePublic = useTogglePublicProfile()

  // Public by default, and that is also the right optimistic answer while the
  // profile is still loading — the row must not flicker "off" and back.
  const isPublic = profile?.is_public_profile ?? true

  return (
    <div className={styles.page}>
      <BackHeader title="Settings" fallback="/home" />

      <SettingsSection title="Account">
        <SettingsRow
          href="/settings/password"
          icon="mdi:lock-outline"
          label="Change password"
        />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsToggleRow
          icon="mdi:earth"
          label="Public profile"
          description="Anyone can view your profile without logging in"
          checked={isPublic}
          busy={togglePublic.isPending}
          onChange={(next) => togglePublic.mutate(next)}
        />
        {/* Only when it's on — a link that 404s is worse than no link. */}
        {isPublic && profile?.username && (
          <ProfileLinkRow url={profileUrl(profile.username, "user")} />
        )}

        {/* Directly under the toggle it depends on: the CV only resolves when
            the profile is public too, and the two settings being adjacent is
            the cheapest way to make that obvious. Players only — a coach or
            scout has a profile, not a CV, and the endpoint behind this row
            answers 403 for them. */}
        {profile?.role === "player" && (
          <SettingsRow
            href="/settings/cv"
            icon="mdi:file-account-outline"
            label="Sports CV"
          />
        )}

        {/* Beside the CV row because they are the same kind of decision —
            "which part of my record do other people get to read" — even though
            they answer to different audiences: the CV faces logged-out
            visitors, the diary summary is in-app only. Players only, same as
            the CV; the endpoint behind this row answers 403 to anyone else. */}
        {profile?.role === "player" && (
          <SettingsRow
            href="/settings/match-diary"
            icon="mdi:notebook-outline"
            label="Match diary"
          />
        )}
        {/* Last in Privacy, and deliberately here rather than under Content:
            blocking is about who may reach you, not about what you saved. */}
        <SettingsRow
          href="/settings/blocked"
          icon="mdi:account-cancel-outline"
          label="Blocked accounts"
        />
      </SettingsSection>

      <SettingsSection title="Content">
        {/* SETTINGS_CONTENT_ROWS */}
        <SettingsRow
          href="/settings/saved"
          icon="mdi:bookmark-outline"
          label="Saved posts"
        />
        <SettingsRow
          href="/settings/mentions"
          icon="mdi:at"
          label="Mentions"
        />
      </SettingsSection>

      <SettingsActionRow
        icon="mdi:logout"
        label="Log out"
        onClick={logout}
        destructive
      />
    </div>
  )
}
