"use client"

/**
 * The organization's settings menu, reached from the gear on its own profile.
 *
 * Saved posts and Mentions live HERE rather than in OrgNav: they are
 * low-frequency, "my own stuff" destinations, and the nav is for the places an
 * admin works day to day. Same building blocks as the personal menu, so the
 * two look and behave identically.
 *
 * Everything listed is already actor-scoped by the X-Actor-* headers the
 * org-admin shell sends, so these rows need no org id beyond the route.
 */

import { useState } from "react"

import { BackHeader } from "@/shared/components/ui"
import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import { ORG_PERMISSIONS, hasOrgPermission } from "@/shared/permissions/orgPermissions"
import { profileUrl } from "@/shared/services/profileUrl"
import { useToggleOrgPublicProfile } from "./hooks/usePrivacySettings"
import ProblemReportSheet from "@/features/support/components/ProblemReportSheet/ProblemReportSheet"
import ProfileLinkRow from "./components/SettingsMenu/ProfileLinkRow"
import {
  SettingsActionRow,
  SettingsRow,
  SettingsSection,
  SettingsToggleRow,
} from "./components/SettingsMenu/SettingsMenu"
import styles from "./SettingsPage.module.css"

export default function OrgSettingsPage({ orgId }: { orgId: string }) {
  const base = `/organization/admin/${orgId}`

  const { data: org } = useOrgDetail(orgId, "id")
  const togglePublic = useToggleOrgPublicProfile(orgId)
  const [reportOpen, setReportOpen] = useState(false)

  const isPublic = org?.is_public_profile ?? true

  // Visible to every member, enabled only with org.privacy — a coach who can't
  // find the setting at all learns nothing; one who sees it greyed out with a
  // reason knows who to ask. The server rejects the write regardless.
  const canEditPrivacy = hasOrgPermission(org, ORG_PERMISSIONS.ORG_PRIVACY)

  return (
    <div className={styles.page}>
      <BackHeader title="Settings" fallback={`${base}/profile`} />

      <SettingsSection title="Organization">
        <SettingsRow
          href={`${base}/members`}
          icon="mdi:account-group-outline"
          label="Members"
        />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <SettingsToggleRow
          icon="mdi:earth"
          label="Public profile"
          description="Anyone can view this organization's profile without logging in"
          checked={isPublic}
          disabled={!canEditPrivacy}
          hint="Only an owner can change this"
          busy={togglePublic.isPending}
          onChange={(next) => togglePublic.mutate(next)}
        />
        {isPublic && org?.username && (
          <ProfileLinkRow url={profileUrl(org.username, "organization")} />
        )}
      </SettingsSection>

      <SettingsSection title="Content">
        {/* ORG_SETTINGS_CONTENT_ROWS */}
        <SettingsRow
          href={`${base}/saved`}
          icon="mdi:bookmark-outline"
          label="Saved posts"
        />
        <SettingsRow
          href={`${base}/mentions`}
          icon="mdi:at"
          label="Mentions"
        />
      </SettingsSection>

      {/* The SAME row as the personal menu, deliberately. An org admin hits
          bugs too — more of them, since posting and recruiting are where the
          heavy screens are — and the two menus being the same shape is the
          whole reason an admin does not have to learn a second layout. */}
      <SettingsSection title="Support">
        <SettingsActionRow
          icon="mdi:flag-outline"
          label="Report a problem"
          onClick={() => setReportOpen(true)}
        />
      </SettingsSection>

      {/* No `onReportAbuse` — same as the personal menu: there is no target
          here that a moderation report could be about. */}
      {reportOpen && (
        <ProblemReportSheet onClose={() => setReportOpen(false)} />
      )}
    </div>
  )
}
