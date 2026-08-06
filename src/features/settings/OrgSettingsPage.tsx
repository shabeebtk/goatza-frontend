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

import { BackHeader } from "@/shared/components/ui"
import {
  SettingsRow,
  SettingsSection,
} from "./components/SettingsMenu/SettingsMenu"
import styles from "./SettingsPage.module.css"

export default function OrgSettingsPage({ orgId }: { orgId: string }) {
  const base = `/organization/admin/${orgId}`

  return (
    <div className={styles.page}>
      <BackHeader title="Settings" fallback={`${base}/profile`} />

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
    </div>
  )
}
