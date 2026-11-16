/**
 * The install page's address, in the three shapes the flow needs: the URL a
 * QR code encodes, the host + path a person reads ("goatza.com/install"), and
 * the Android intent that reopens the page in Chrome from an in-app browser.
 * Client only: siteOrigin() falls back to window.location in the browser.
 */

import { siteOrigin } from "@/features/profile/services/publicProfile.api"

export const INSTALL_PATH = "/install"

/** Shown when no origin can be worked out at all. */
const FALLBACK_HOST = "goatza.com"

export function installUrl(): string {
  return `${siteOrigin()}${INSTALL_PATH}`
}

function originHost(): string {
  try {
    return new URL(siteOrigin()).host || FALLBACK_HOST
  } catch {
    return FALLBACK_HOST
  }
}

/** "goatza.com/install": the real host, for people to read and type. */
export function installDisplayUrl(): string {
  return `${originHost()}${INSTALL_PATH}`
}

/**
 * Opens /install in Chrome from an Android in-app browser (Instagram, a
 * WebView). Where Chrome is missing, Android follows browser_fallback_url.
 */
export function chromeIntentHref(): string {
  const fallback = encodeURIComponent(installUrl())
  return (
    `intent://${originHost()}${INSTALL_PATH}` +
    `#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
  )
}
