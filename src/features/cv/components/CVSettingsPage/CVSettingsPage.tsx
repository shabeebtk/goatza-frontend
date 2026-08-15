"use client"

/**
 * Settings → Sports CV.
 *
 * Built from the same SettingsToggleRow / SettingsSection pieces as the account
 * menu, so a new switch here is one row and looks like every other switch in
 * the app.
 *
 * ── The dependency, stated out loud ───────────────────────────
 *
 * The CV only resolves when the profile is ALSO public — the backend gates it
 * on `is_public_profile` (see cv/selectors/cv_selectors.py) rather than keeping
 * a second copy of the privacy rule. That makes it possible to switch the CV on
 * and still hand out a link that 404s, so the notice above the toggles says so
 * and links straight to the setting that fixes it.
 *
 * The master switch is deliberately NOT disabled while the profile is private.
 * A control that does nothing with no explanation is worse than one that
 * explains itself, the owner may well be about to turn both on, and the real
 * gate is server-side either way.
 *
 * ── 403 ───────────────────────────────────────────────────────
 *
 * Only players have a CV. A coach or scout who reaches this URL gets a 403 from
 * the settings endpoint, and the screen prints the reason the server gave
 * rather than a generic failure — the server's message names the role.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import { BackHeader } from "@/shared/components/ui"
import {
  SettingsSection,
  SettingsToggleRow,
} from "@/features/settings/components/SettingsMenu/SettingsMenu"
import ProfileLinkRow from "@/features/settings/components/SettingsMenu/ProfileLinkRow"
import { cvUrl, type CVToggle } from "../../services/cv.api"
import { useCVSettings, useUpdateCVSettings } from "../../hooks/useCVSettings"
import styles from "./CVSettingsPage.module.css"

export default function CVSettingsPage() {
  const { data: settings, isPending, error } = useCVSettings()
  const update = useUpdateCVSettings()

  // One helper for all six rows: they differ only by which key they flip.
  const toggle = (key: CVToggle) => (next: boolean) =>
    update.mutate({ [key]: next })

  const status = (error as { response?: { status?: number } })?.response?.status
  const message = (
    error as { response?: { data?: { message?: string } } }
  )?.response?.data?.message

  if (error) {
    return (
      <div className={styles.page}>
        <BackHeader title="Sports CV" fallback="/settings" />
        <div className={styles.state}>
          <Icon icon="mdi:alert-circle-outline" width={28} height={28} />
          <p className={styles.stateText}>
            {status === 403
              ? message ?? "Only players have a Sports CV."
              : "Couldn't load your CV settings."}
          </p>
        </div>
      </div>
    )
  }

  // Everything defaults to its model default while the first fetch is in
  // flight, so no switch flickers from one position to the other.
  const isEnabled = settings?.is_enabled ?? false
  const isPublicProfile = settings?.is_public_profile ?? true
  const username = settings?.username ?? null

  return (
    <div className={styles.page}>
      <BackHeader title="Sports CV" fallback="/settings" />

      <p className={styles.intro}>
        A one-page bio-data sheet built from your profile, career, achievements
        and highlights. Share the link, or let a coach scan the QR code.
      </p>

      {/* The dependency, above the switch it governs — not hidden behind a
          disabled control the owner would have to guess about. */}
      {!isPending && !isPublicProfile && (
        <div className={styles.notice} role="status">
          <Icon
            icon="mdi:eye-off-outline"
            width={18}
            height={18}
            aria-hidden="true"
          />
          <p className={styles.noticeText}>
            Your profile is private, so your CV link won&apos;t open for
            anyone.{" "}
            <Link href="/settings" className={styles.noticeLink}>
              Turn on Public profile
            </Link>{" "}
            to use it.
          </p>
        </div>
      )}

      <SettingsSection title="Sports CV">
        <SettingsToggleRow
          icon="mdi:file-account-outline"
          label="Sports CV"
          description="Anyone with the link can view your CV"
          checked={isEnabled}
          busy={update.isPending}
          onChange={toggle("is_enabled")}
        />
        {/* Only when it's on — a link that 404s is worse than no link. */}
        {isEnabled && username && <ProfileLinkRow url={cvUrl(username)} />}
      </SettingsSection>

      <SettingsSection title="Contact">
        <SettingsToggleRow
          icon="mdi:phone-outline"
          label="Show phone number"
          // Names the risk plainly. This is the one switch on the screen that
          // publishes something a player cannot take back once it is copied,
          // and a large share of them are minors.
          description="Anyone with your CV link can see this. Your email is never shown."
          checked={settings?.show_contact ?? false}
          busy={update.isPending}
          onChange={toggle("show_contact")}
        />
      </SettingsSection>

      <SettingsSection title="Sections">
        <SettingsToggleRow
          icon="mdi:tune-variant"
          label="Sport details"
          description="Position, experience level and your sport's attributes"
          checked={settings?.show_attributes ?? true}
          busy={update.isPending}
          onChange={toggle("show_attributes")}
        />
        <SettingsToggleRow
          icon="mdi:briefcase-outline"
          label="Career"
          description="Clubs, academies and teams you've played for"
          checked={settings?.show_career ?? true}
          busy={update.isPending}
          onChange={toggle("show_career")}
        />
        <SettingsToggleRow
          icon="mdi:trophy-variant-outline"
          label="Achievements"
          description="Trophies, awards and records"
          checked={settings?.show_achievements ?? true}
          busy={update.isPending}
          onChange={toggle("show_achievements")}
        />
        <SettingsToggleRow
          icon="mdi:play-circle-outline"
          label="Highlights"
          // Says the rule rather than leaving it to be discovered: the CV rail
          // is `everyone`-only for every viewer, including recruiters.
          description="Only clips set to Everyone appear on your CV"
          checked={settings?.show_highlights ?? true}
          busy={update.isPending}
          onChange={toggle("show_highlights")}
        />
      </SettingsSection>

      {isEnabled && (settings?.views_count ?? 0) > 0 && (
        <p className={styles.views}>
          Your CV has been viewed {settings?.views_count}{" "}
          {settings?.views_count === 1 ? "time" : "times"}.
        </p>
      )}
    </div>
  )
}
