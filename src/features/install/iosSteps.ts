import type { InstallTarget } from "@/core/pwa/useInstallTarget"
import {
  IOS_CHROME_STEPS,
  IOS_SAFARI_CLASSIC_STEPS,
  IOS_SAFARI_MODERN_STEPS,
  type IosStep,
} from "./installCopy"

/** Which set of iPhone steps applies: Safari 26+, Safari 18 and older, or Chrome. */
export type IosGuideKind = "modern" | "classic" | "chrome"

/** The guide for an iPhone target, or null when the steps do not apply. */
export function iosGuideKind(target: InstallTarget): IosGuideKind | null {
  if (target.mode === "ios-safari") return target.iosSteps
  if (target.mode === "ios-chrome") return "chrome"
  return null
}

export function iosStepsFor(kind: IosGuideKind): readonly IosStep[] {
  if (kind === "chrome") return IOS_CHROME_STEPS
  return kind === "classic" ? IOS_SAFARI_CLASSIC_STEPS : IOS_SAFARI_MODERN_STEPS
}
