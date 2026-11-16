import {
  APP_INSTALLED_EVENT,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_GLOBAL,
  INSTALLED_GLOBAL,
} from "./constants"

/**
 * Catches the browser's install prompt BEFORE React has hydrated.
 *
 * Chromium fires `beforeinstallprompt` once the person has tapped the page and
 * stayed about 30 seconds, and nothing stops that landing before hydration on
 * a slow phone. A listener added in an effect would simply miss it, and the
 * event is not fired again for that page. So this script, in <head>, is the
 * one listener for the two native events:
 *
 *   - `beforeinstallprompt` → preventDefault() (no browser mini-banner: our
 *     own Install button asks instead), park the event on
 *     window.__goatzaInstallPrompt, dispatch "goatza:installprompt";
 *   - `appinstalled` → window.__goatzaInstalled = true, dispatch
 *     "goatza:appinstalled".
 *
 * core/pwa/installPrompt.ts picks both up when it starts and listens for the
 * two custom events after that.
 *
 * Built like ThemeScript: a static string with no user data in it, inline
 * rather than next/script so it runs during parsing. It never throws. iPhone
 * and iPad have neither event, so there it adds two listeners that never fire.
 */
const SCRIPT = `(function(){try{var w=window;function f(n){try{w.dispatchEvent(new Event(n))}catch(e){}}w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w[${JSON.stringify(INSTALL_PROMPT_GLOBAL)}]=e;f(${JSON.stringify(INSTALL_PROMPT_EVENT)})});w.addEventListener("appinstalled",function(){w[${JSON.stringify(INSTALLED_GLOBAL)}]=true;f(${JSON.stringify(APP_INSTALLED_EVENT)})})}catch(e){}})()`

export default function InstallPromptScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
