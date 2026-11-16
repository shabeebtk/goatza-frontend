"use client"

import { useState } from "react"

import { promptInstall } from "@/core/pwa/installPrompt"
import { useInstallTarget } from "@/core/pwa/useInstallTarget"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { LANDING_COPY } from "../installCopy"

/**
 * The landing page's install buttons: the target, plus Chrome's one-tap
 * prompt with a toast when it is accepted. Everything that is not one tap
 * goes to /install (or, on an iPhone, a sheet) and is decided by the caller.
 */
export function useInstallAction() {
  const target = useInstallTarget()
  const toast = useToast()
  const [prompting, setPrompting] = useState(false)

  const promptNow = async () => {
    // A second tap while the dialog is up: nothing to do, and not a reason
    // to send anyone to /install either.
    if (prompting) return "busy" as const
    setPrompting(true)
    const outcome = await promptInstall()
    setPrompting(false)
    if (outcome === "accepted") {
      toast.show({ title: LANDING_COPY.installedToast, variant: "success", position: "top-center" })
    }
    return outcome
  }

  return { target, prompting, promptNow }
}
