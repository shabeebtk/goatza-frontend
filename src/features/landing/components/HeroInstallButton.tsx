"use client"

import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import type { InstallMode } from "@/core/pwa/useInstallTarget"
import { useInstallAction } from "@/features/install/hooks/useInstallAction"
import { LANDING_COPY } from "@/features/install/installCopy"
import { INSTALL_PATH } from "@/features/install/installLinks"
import { Button } from "@/shared/components/ui"

/** The hero button's words. Neutral until the browser is known. */
export function heroInstallLabel(mode: InstallMode): string {
  if (mode === "android-prompt" || mode === "android-menu") return LANDING_COPY.heroAndroid
  if (mode === "ios-safari" || mode === "ios-chrome" || mode === "ios-other") {
    return LANDING_COPY.heroIos
  }
  return LANDING_COPY.heroNeutral
}

/**
 * The hero's second button, beside Register. One tap where Chrome has offered
 * its prompt; /install for everything else. Gone inside the installed app.
 */
export default function HeroInstallButton({ className }: { className?: string }) {
  const router = useRouter()
  const { target, prompting, promptNow } = useInstallAction()

  if (target.mode === "installed") return null

  const label = heroInstallLabel(target.mode)
  const icon = <Icon icon="mdi:cellphone-arrow-down" width={18} height={18} />

  if (target.mode === "android-prompt") {
    return (
      <Button
        variant="outline"
        size="lg"
        leftIcon={icon}
        className={className}
        loading={prompting}
        onClick={async () => {
          if ((await promptNow()) === "unavailable") router.push(INSTALL_PATH)
        }}
      >
        {label}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="lg" leftIcon={icon} className={className} href={INSTALL_PATH}>
      {label}
    </Button>
  )
}
