/**
 * /join — pre-launch player registration.
 *
 * TOP LEVEL, not inside the (public) route group. That group's layout wraps
 * every child in <PublicShell>, which paints the app's nav chrome — a top bar,
 * a bottom bar, sign-in affordances. All of it is right for a shared profile
 * and wrong here: this page is opened from an Instagram bio by somebody who has
 * never seen the product, and the only thing on it should be the pitch and the
 * form. Same reasoning that puts the landing page at app/page.tsx.
 */

// Always dark (like the landing page) → a dark status bar in every OS theme.
export const viewport = {
  themeColor: "#000000",
}

import type { Metadata } from "next"

import JoinPage from "@/features/join/components/JoinPage"

export const metadata: Metadata = {
  title: "Join Goatza — Kerala football",
  description:
    "Register as a player before Goatza opens on 1 Jan 2027. Get seen by scouts and clubs across Kerala.",
}

export default function Join() {
  return <JoinPage />
}
