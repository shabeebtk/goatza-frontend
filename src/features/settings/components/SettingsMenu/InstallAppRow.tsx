"use client"

import { useInstallTarget } from "@/core/pwa/useInstallTarget"
import { SETTINGS_INSTALL_LABEL } from "@/features/install/installCopy"
import { INSTALL_PATH } from "@/features/install/installLinks"
import { SettingsRow } from "./SettingsMenu"

/**
 * "Install the app" → /install. Not shown inside the installed app, and not
 * until the browser is known, so the installed app never flashes it.
 */
export default function InstallAppRow() {
  const { mode } = useInstallTarget()
  if (mode === "installed" || mode === "unknown") return null

  return <SettingsRow href={INSTALL_PATH} icon="mdi:cellphone-arrow-down" label={SETTINGS_INSTALL_LABEL} />
}
