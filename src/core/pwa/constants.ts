/**
 * Every name the install code shares between the inline <head> script, the
 * store and the counting code. One file, so the script (a string) and the
 * modules that read what it left behind cannot drift apart.
 */

/** Dispatched on window by InstallPromptScript when a prompt is captured. */
export const INSTALL_PROMPT_EVENT = "goatza:installprompt"

/** Dispatched on window by InstallPromptScript when the browser installs the app. */
export const APP_INSTALLED_EVENT = "goatza:appinstalled"

/** Where InstallPromptScript parks the captured `beforeinstallprompt` event. */
export const INSTALL_PROMPT_GLOBAL = "__goatzaInstallPrompt"

/** Set to true by InstallPromptScript once `appinstalled` has fired. */
export const INSTALLED_GLOBAL = "__goatzaInstalled"

/** A random id for this browser's copy of the app. Not a fingerprint. */
export const DEVICE_ID_KEY = "goatza:device-id"

/** The Asia/Kolkata day (YYYY-MM-DD) an "opened" event was last sent. */
export const OPENED_DAY_KEY = "goatza:app-opened-day"

/** Whose calendar "once a day" means — the backend counts open_days in it too. */
export const APP_DAY_TIME_ZONE = "Asia/Kolkata"

/**
 * `beforeinstallprompt` is Chromium-only and is NOT in TypeScript's DOM lib, so
 * there is nothing to import. This declares the two members we touch.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

/** `window`, with what InstallPromptScript may have left on it. */
export type InstallWindow = Window & {
  [INSTALL_PROMPT_GLOBAL]?: BeforeInstallPromptEvent | null
  [INSTALLED_GLOBAL]?: boolean
}
