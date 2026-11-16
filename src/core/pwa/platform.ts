/**
 * What device and browser this is, for the install page's wording and for
 * counting installs. Pure: the user-agent string and the navigator are passed
 * in, so a test can feed it any user agent.
 *
 * Sniffing is the only way to answer this. An iPhone has no install API to
 * feature-detect, and the steps to install differ between Safari versions and
 * between browsers on the same phone.
 */

export type PwaOs = "android" | "ios" | "desktop" | "other"

export type PwaBrowser =
  | "chrome"
  | "safari"
  | "samsung"
  | "firefox"
  | "edge"
  | "opera"
  | "other"

/**
 * An in-app browser (Instagram, Facebook, …), which cannot install anything.
 * `name` is null for an Android WebView we cannot name.
 */
export type InAppBrowser = { name: string | null } | null

export type PlatformInfo = {
  os: PwaOs
  browser: PwaBrowser
  inApp: InAppBrowser
  /**
   * The major version in Safari's "Version/NN" on iOS, or null. Read from
   * there and never from "iPhone OS 18_6": iOS 26 freezes that part of the
   * user agent, so it stops telling the truth.
   */
  safariMajor: number | null
}

/** The only navigator fields detection reads. */
export type NavigatorLike = {
  maxTouchPoints?: number
}

/** Named in-app browsers, checked in order. The first match wins. */
const IN_APP: Array<[RegExp, string]> = [
  [/Instagram/, "Instagram"],
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/LinkedInApp/, "LinkedIn"],
  [/Snapchat/, "Snapchat"],
  [/Twitter/, "X"],
  [/musical_ly|BytedanceWebview|TikTok/, "TikTok"],
  [/\bLine\//, "LINE"],
]

function detectOs(ua: string, nav?: NavigatorLike): PwaOs {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  // iPadOS asks for the desktop site and reports a Mac. A Mac has no
  // touchscreen, so more than one touch point means an iPad.
  if (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1) return "ios"
  if (/Android/.test(ua)) return "android"
  if (/Windows NT|Macintosh|CrOS|X11|Linux/.test(ua)) return "desktop"
  return "other"
}

function detectBrowser(ua: string, os: PwaOs): PwaBrowser {
  if (os === "ios") {
    // Every iPhone browser is WebKit; each marks itself with its own token.
    if (/CriOS\//.test(ua)) return "chrome"
    if (/FxiOS\//.test(ua)) return "firefox"
    if (/EdgiOS\//.test(ua)) return "edge"
    if (/OPiOS\//.test(ua)) return "opera"
    if (/Version\/[\d.]+.*Safari\//.test(ua)) return "safari"
    return "other"
  }

  if (os === "android") {
    if (/SamsungBrowser\//.test(ua)) return "samsung"
    if (/Firefox\//.test(ua)) return "firefox"
    if (/EdgA\//.test(ua)) return "edge"
    if (/OPR\//.test(ua)) return "opera"
    if (/Chrome\//.test(ua)) return "chrome"
    return "other"
  }

  // Desktop, and anything else. Order matters: Edge and Opera both carry
  // "Chrome/", and every Chromium browser also says "Safari/".
  if (/Edg\//.test(ua)) return "edge"
  if (/OPR\//.test(ua)) return "opera"
  if (/Firefox\//.test(ua)) return "firefox"
  if (/Chrome\//.test(ua)) return "chrome"
  if (/Version\/[\d.]+.*Safari\//.test(ua)) return "safari"
  return "other"
}

function detectInApp(ua: string, os: PwaOs): InAppBrowser {
  for (const [pattern, name] of IN_APP) {
    if (pattern.test(ua)) return { name }
  }
  // An Android WebView marks itself "; wv)". Some app we cannot name.
  if (os === "android" && /; wv\)/.test(ua)) return { name: null }
  return null
}

function detectSafariMajor(ua: string, os: PwaOs, browser: PwaBrowser): number | null {
  if (os !== "ios" || browser !== "safari") return null
  const match = /Version\/(\d+)/.exec(ua)
  return match ? Number(match[1]) : null
}

export function detectPlatform(ua: string, nav?: NavigatorLike): PlatformInfo {
  const source = ua ?? ""
  const os = detectOs(source, nav)
  const browser = detectBrowser(source, os)
  return {
    os,
    browser,
    inApp: detectInApp(source, os),
    safariMajor: detectSafariMajor(source, os, browser),
  }
}

/** detectPlatform for this browser. Client only. */
export function currentPlatform(): PlatformInfo {
  return detectPlatform(navigator.userAgent, navigator)
}

/**
 * True when running as the installed app: a standalone or fullscreen window,
 * or iOS's own flag. False on the server.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  try {
    return (
      typeof window.matchMedia === "function" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches)
    )
  } catch {
    return false
  }
}
