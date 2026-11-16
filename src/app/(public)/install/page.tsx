/**
 * /install: how to put Goatza on your home screen.
 *
 * In `(public)` because the people it is for are often signed out (a link in a
 * WhatsApp group, the QR code on the desktop page), and listed in PublicShell's
 * CONTENT_FIRST_ROUTES so it never waits behind a profile skeleton. "install"
 * is reserved as a username on both sides (app/[username] RESERVED and the
 * backend's RESERVED_USERNAMES), since this segment sits beside /[username].
 * Indexable, and in the sitemap.
 */

import type { Metadata } from "next"

import InstallPage from "@/features/install/components/InstallPage/InstallPage"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"

const TITLE = "Install Goatza"
const DESCRIPTION = "Put Goatza on your home screen: full screen, trial alerts, no app store."

export function generateMetadata(): Metadata {
  const origin = siteOrigin()

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${origin}/install` },
    openGraph: {
      type: "website",
      title: TITLE,
      description: DESCRIPTION,
      url: `${origin}/install`,
      siteName: "Goatza",
    },
  }
}

export default function InstallRoute() {
  return <InstallPage />
}
