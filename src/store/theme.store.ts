import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/**
 * The colour theme, chosen by the user and nobody else.
 *
 * LIGHT BY DEFAULT, AND THE OS IS NOT CONSULTED. The app used to follow
 * `prefers-color-scheme`, which meant a phone set to dark got a dark Goatza
 * whether or not the person wanted one, and there was no way to say otherwise.
 * Now every stylesheet keys off `data-theme` on <html> (globals.css defines the
 * dark tokens under `:root[data-theme="dark"]`), and this store is the only
 * thing that writes it.
 *
 * DEVICE-LOCAL, on purpose. It persists to localStorage and nowhere else — no
 * profile field, no API call — so it is a fact about this browser, not about
 * the account. The Settings row says as much.
 *
 * TWO READERS OF THE SAME KEY. The inline script in app/layout.tsx reads
 * `THEME_STORAGE_KEY` before first paint and sets `data-theme` itself, so a
 * dark-theme user never sees a light flash while React boots. It parses the
 * exact shape `persist` writes (`{ state: { theme }, version }`), so the key
 * and the shape are part of that script's contract — change one, change both.
 *
 * Reading `theme` from a component is hydration-safe as-is: zustand serves the
 * store's INITIAL state (light) for the server render and for the hydration
 * pass, and only then the persisted value, so server markup and the first
 * client render always agree. See ThemeColorMeta and the Settings toggle.
 */

export type Theme = "light" | "dark"

export const THEME_STORAGE_KEY = "goatza:theme"

const DEFAULT_THEME: Theme = "light"

export const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark"

/** What a persisted blob of unknown provenance is worth: a theme, or light. */
const themeFromStorage = (persisted: unknown): Theme => {
  const stored = (persisted as { theme?: unknown } | undefined)?.theme
  return isTheme(stored) ? stored : DEFAULT_THEME
}

/**
 * The one place the attribute is written. `dataset.theme` ↔ `data-theme`,
 * which is what every `[data-theme="dark"]` rule matches on.
 */
export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = theme
}

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,

      setTheme: (theme) => {
        // Anything that is not a theme is treated as "no preference", never
        // written to the DOM and never persisted.
        const next = isTheme(theme) ? theme : DEFAULT_THEME
        set({ theme: next })
        applyTheme(next)
      },

      toggleTheme: () => {
        get().setTheme(get().theme === "dark" ? "light" : "dark")
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Only the value. The actions must not land in storage, and the next
      // field added here should have to opt in.
      partialize: (state) => ({ theme: state.theme }),

      // Storage is user-writable and survives releases, so whatever comes back
      // is validated rather than trusted: a missing key, a hand-edited value,
      // or a shape from a future version all land on the default. Empty
      // storage lands there too, which is what "light by default" means.
      merge: (persisted, current) => ({
        ...current,
        theme: themeFromStorage(persisted),
      }),

      // Same validation for a value written under any other `version`. The
      // head script does not look at the version at all, and without this the
      // store would refuse the value (and log) where the script accepted it —
      // the two readers of the key must agree.
      migrate: (persisted) => ({ theme: themeFromStorage(persisted) }),

      // The head script has normally set the attribute already; this
      // re-applies what the store actually accepted, so the DOM and the store
      // can never disagree — and a test, which has no head script, gets the
      // attribute from here. Unreadable storage lands on light, matching the
      // server markup.
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? DEFAULT_THEME)
      },
    }
  )
)
