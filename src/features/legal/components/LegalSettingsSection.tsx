"use client"

import { useQuery } from "@tanstack/react-query"

import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/SettingsMenu/SettingsMenu"
import { useAuthStore } from "@/store/auth.store"
import { GATING_SLUGS, LEGAL_LABELS, LEGAL_SLUGS, legalHref } from "../constants"
import { getLegalVersionsApi } from "../services/legal.api"

/**
 * The Legal section of Settings: all four documents, each with the version
 * this user is standing on.
 *
 * TWO DIFFERENT "VERSIONS" ARE ON SCREEN HERE, and the distinction is the
 * whole reason this component exists rather than four plain rows:
 *
 *   * Terms and Privacy are AGREED TO, so the row shows what THIS USER
 *     accepted — from `user.legal.accepted_versions`. That is a fact about
 *     them, and it is the honest thing to print beside their own record.
 *   * Guidelines and Youth Safety are PUBLISHED, not agreed to. Nobody
 *     accepts them, so there is no personal version to show and the row
 *     carries the current published one instead, from GET /legal/versions.
 *
 * Printing the current version under all four would quietly claim the user had
 * accepted the latest terms even while the re-consent modal was asking them to.
 */
export default function LegalSettingsSection() {
  const legal = useAuthStore((s) => s.user?.legal)

  // Public, four constants, changes a few times a year — so it is cached hard
  // and never refetched on focus. A settings screen must not spend a request
  // on this every time it is opened.
  const { data: published } = useQuery({
    queryKey: ["legal", "versions"],
    queryFn: getLegalVersionsApi,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const describe = (slug: (typeof LEGAL_SLUGS)[number]): string | undefined => {
    const isGating = (GATING_SLUGS as readonly string[]).includes(slug)

    if (isGating) {
      const accepted = legal?.accepted_versions?.[slug]
      if (accepted) return `You accepted version ${accepted}`
      // Either genuinely never accepted, or the user in the store came from a
      // login response that carries no legal block. Saying nothing is better
      // than guessing which.
      return undefined
    }

    const version = published?.[slug]
    return version ? `Version ${version}` : undefined
  }

  return (
    <SettingsSection title="Legal">
      {LEGAL_SLUGS.map((slug) => (
        <SettingsRow
          key={slug}
          href={legalHref(slug)}
          icon={ICONS[slug]}
          label={LEGAL_LABELS[slug]}
          description={describe(slug)}
        />
      ))}
    </SettingsSection>
  )
}

const ICONS: Record<(typeof LEGAL_SLUGS)[number], string> = {
  terms: "mdi:file-document-outline",
  privacy: "mdi:shield-lock-outline",
  guidelines: "mdi:account-group-outline",
  safety: "mdi:shield-account-outline",
}
