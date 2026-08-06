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
import {
  SettingsActionRow,
  SettingsRow,
  SettingsSection,
} from "./components/SettingsMenu/SettingsMenu"
import styles from "./SettingsPage.module.css"

export default function SettingsPage() {
  const logout = useLogout()

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
