/**
 * Community Guidelines — /guidelines
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

const SLUG = "guidelines" as const
const DESCRIPTION =
  "The rules for posts, comments, profiles, messages and recruitment listings on Goatza — and how we enforce them."

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
    alternates: { canonical: `${origin}/guidelines` },
    openGraph: {
      type: "article",
      title: `${document.title} · Goatza`,
      description: DESCRIPTION,
      url: `${origin}/guidelines`,
      siteName: "Goatza",
    },
  }
}

export default function CommunityGuidelinesPage() {
  return <LegalDocumentView slug={SLUG} />
}
