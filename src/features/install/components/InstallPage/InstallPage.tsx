"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useInstallTarget } from "@/core/pwa/useInstallTarget"
import { usePWAInstall } from "@/core/pwa/usePWAInstall"
import AndroidInstall from "./AndroidInstall"
import DesktopInstall from "./DesktopInstall"
import InAppInstall from "./InAppInstall"
import InstalledPanel from "./InstalledPanel"
import InstallSkeleton from "./InstallSkeleton"
import IosInstall from "./IosInstall"

/**
 * /install: how to put Goatza on this device's home screen, for whichever
 * device and browser opened it (core/pwa/useInstallTarget decides).
 *
 * Always dark, phone first. "installed" means one of two things: opened INSIDE
 * the installed app, which goes straight to the feed, or installed from this
 * very tab a moment ago, which gets the Installed panel.
 */
export default function InstallPage() {
  const router = useRouter()
  const target = useInstallTarget()
  const { installedNow } = usePWAInstall()

  const openedInApp = target.mode === "installed" && !installedNow

  useEffect(() => {
    if (openedInApp) router.replace("/home")
  }, [openedInApp, router])

  switch (target.mode) {
    case "unknown":
      return <InstallSkeleton />
    case "installed":
      return openedInApp ? <InstallSkeleton /> : <InstalledPanel />
    case "android-prompt":
    case "android-menu":
      return <AndroidInstall canPrompt={target.mode === "android-prompt"} />
    case "ios-safari":
      return (
        <IosInstall
          browser="safari"
          iosSteps={target.iosSteps}
          safariMajorKnown={target.platform.safariMajor !== null}
        />
      )
    case "ios-chrome":
      return <IosInstall browser="chrome" />
    case "ios-other":
      return <InAppInstall os="ios" appName={null} kind="ios-other" />
    case "in-app":
      return <InAppInstall os={target.os} appName={target.appName} kind="in-app" />
    case "desktop":
      return <DesktopInstall canPrompt={target.canPrompt} isMacSafari={target.isMacSafari} />
  }
}
