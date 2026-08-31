/**
 * Privacy Policy — /privacy
 *
 * Static: the document is read off disk at build time, so this renders once
 * into HTML that Vercel serves from the edge. Nothing here is dynamic, and
 * nothing fetches the backend — see the note in shared/services/legal.ts about
 * why a build must never depend on Render being awake.
 */

import type { Metadata } from "next"

import { getLegalDocument } from "@/shared/services/legal"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"

import LegalDocumentView from "../LegalDocumentView"

const SLUG = "privacy" as const
const DESCRIPTION =
  "What personal data Goatza collects, why we collect it, who we share it with, how long we keep it, and the rights you have over it under the DPDP Act."

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument(SLUG)
  const origin = siteOrigin()

  return {
    title: `${document.title} · Goatza`,
    description: DESCRIPTION,
    // INDEXABLE, unlike most of this app. These pages are how someone checks
    // what they agreed to without having an account, and app stores and
    // payment providers both expect to find them by search.
    robots: { index: true, follow: true },
    alternates: { canonical: `${origin}/privacy` },
    openGraph: {
      type: "article",
      title: `${document.title} · Goatza`,
      description: DESCRIPTION,
      url: `${origin}/privacy`,
      siteName: "Goatza",
    },
  }
}

export default function PrivacyPolicyPage() {
  return <LegalDocumentView slug={SLUG} />
}
