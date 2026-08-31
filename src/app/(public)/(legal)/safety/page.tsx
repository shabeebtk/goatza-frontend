/**
 * Youth Safety — /safety
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

const SLUG = "safety" as const
const DESCRIPTION =
  "How Goatza protects young athletes: a plain-language guide for parents, guardians and players under 18."

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
    alternates: { canonical: `${origin}/safety` },
    openGraph: {
      type: "article",
      title: `${document.title} · Goatza`,
      description: DESCRIPTION,
      url: `${origin}/safety`,
      siteName: "Goatza",
    },
  }
}

export default function YouthSafetyPage() {
  return <LegalDocumentView slug={SLUG} />
}
