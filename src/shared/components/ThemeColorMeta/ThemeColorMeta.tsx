"use client";

/**
 * Per-section <meta name="theme-color"> tags. React 19 hoists these into <head>.
 *
 * The root layout intentionally sets NO global theme-color, so the first
 * matching meta in each route's tree wins:
 *   - landing / auth (server pages) export viewport.themeColor = "#000000" (dark)
 *   - in-app sections render this component (theme-aware)
 *
 * Colours match the in-app top bar background (var(--color-surface)):
 *   light mode → #ffffff (neutral-0), dark mode → #131814 (neutral-850)
 * so modern iOS/Android tint the status bar to match the section instead of the
 * landing page's black. iOS standalone (black-translucent) ignores this and uses
 * the safe-area padding for overlap; this only affects Android + browser chrome.
 */
export default function ThemeColorMeta() {
  return (
    <>
      <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#131814" media="(prefers-color-scheme: dark)" />
    </>
  );
}
