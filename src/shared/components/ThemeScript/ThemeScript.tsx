import { THEME_STORAGE_KEY } from "@/store/theme.store"

/**
 * Sets `data-theme` on <html> BEFORE FIRST PAINT.
 *
 * The server always renders `data-theme="light"` (see app/layout.tsx), and the
 * theme store only catches up once React has hydrated — on a phone that is a
 * visible light flash for anyone who chose dark. A parser-blocking script in
 * <head> closes that gap: the body has not been parsed, so nothing has been
 * painted, when it runs.
 *
 * The rules it lives by:
 *   - it reads the SAME key and shape zustand's `persist` writes, so the store
 *     and the script cannot disagree (`{ state: { theme }, version }`);
 *   - anything other than the literal "dark" is light — empty storage, a
 *     hand-edited value, a private window where localStorage throws;
 *   - it never throws, and it never asks `prefers-color-scheme`. The OS setting
 *     is not an input here; the Settings toggle is the only way to go dark.
 *
 * A plain inline <script> rather than next/script: it has to execute inline
 * during parsing, and the whole thing is one statement.
 */

// Written as a string on purpose — it must not be transpiled into anything
// that needs the React runtime or module scope to be ready.
const SCRIPT = `(function(){var t="light";try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}));if(s&&s.state&&s.state.theme==="dark")t="dark"}catch(e){}document.documentElement.dataset.theme=t})()`

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
