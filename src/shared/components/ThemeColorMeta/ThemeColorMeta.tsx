"use client";

import { useThemeStore } from "@/store/theme.store";

/**
 * Per-section <meta name="theme-color">. React 19 hoists it into <head>.
 *
 * The root layout intentionally sets NO global theme-color, so the first
 * matching meta in each route's tree wins:
 *   - landing / auth (server pages) export viewport.themeColor = "#000000" (dark)
 *   - in-app sections render this component, which follows the theme store
 *
 * ONE meta, driven by the store — not two `media`-scoped ones. The theme is a
 * user choice held in the store (see store/theme.store.ts), not the OS
 * setting, so a `(prefers-color-scheme: …)` pair would tint the status bar to
 * the phone's theme while the page below it followed the user's. React
 * updates the hoisted tag's `content` when the store changes, and Android
 * Chrome / Safari re-tint on the fly.
 *
 * Colours match the in-app top bar background (var(--color-surface)):
 *   light → #ffffff (neutral-0), dark → #131814 (neutral-850)
 * so modern iOS/Android tint the status bar to match the section instead of the
 * landing page's black. iOS standalone (black-translucent) ignores this and uses
 * the safe-area padding for overlap; this only affects Android + browser chrome.
 *
 * Hydration: the store reports "light" for the server render and the hydration
 * pass and the persisted value only after that, so the markup never mismatches.
 * The cost is that a dark-theme user's status bar goes white → dark once React
 * boots on a server-rendered public page; the page itself is dark from the
 * first paint (the inline script in app/layout.tsx handles that).
 */
export default function ThemeColorMeta() {
  const theme = useThemeStore((s) => s.theme);

  return (
    <meta name="theme-color" content={theme === "dark" ? "#131814" : "#ffffff"} />
  );
}
