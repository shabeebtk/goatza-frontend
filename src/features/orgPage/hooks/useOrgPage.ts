"use client"

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { orgKeys } from "@/features/organization/hooks/useOrganizations"
import type { OrganizationDetail } from "@/features/organization/types"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { pageErrorSentence } from "../pageErrors"
import {
  getPageAdminApi,
  updateAboutApi,
  updateContactApi,
  updateFactsApi,
  updateSectionsApi,
} from "../services/orgPage.api"
import type {
  PageAdmin,
  PageContact,
  PageFactsPayload,
  PageSections,
  PageSettings,
  SectionStatus,
  SwitchableSection,
} from "../types"
import { invalidateShowcases } from "./usePageShowcase"

// ── Query keys ────────────────────────────────────────────────

/** Everything under the org, so one page's caches can be dropped at once. */
export const pageKeys = {
  all: () => ["orgPage"] as const,
  org: (orgId: string) => ["orgPage", orgId] as const,
  admin: (orgId: string) => ["orgPage", orgId, "admin"] as const,
  programs: (orgId: string) => ["orgPage", orgId, "programs"] as const,
  facilities: (orgId: string) => ["orgPage", orgId, "facilities"] as const,
  coaches: (orgId: string) => ["orgPage", orgId, "coaches"] as const,
  players: (orgId: string) => ["orgPage", orgId, "players"] as const,
  /** The picked list with the candidates `q` narrows ("" = the editor's own list). */
  playersList: (orgId: string, q = "") => ["orgPage", orgId, "players", q.trim()] as const,
}

// ── What a write does to the hub ──────────────────────────────

/**
 * A settings write answers with the whole PageSettings: it goes into the hub's
 * cache at once, and the hub is refetched so readiness and the counts follow.
 */
function storeSettings(queryClient: QueryClient, orgId: string, settings: PageSettings) {
  queryClient.setQueryData<PageAdmin>(pageKeys.admin(orgId), (old) =>
    old ? withSettings(old, settings) : old
  )
  queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
  invalidateShowcases(queryClient)
}

/** The hub with new settings; each section's `enabled` follows its switch. */
function withSettings(admin: PageAdmin, settings: PageSettings): PageAdmin {
  // Each entry keeps its own numbers; only `enabled` moves.
  const sections: Record<string, SectionStatus> = { ...admin.sections }
  for (const key of Object.keys(settings.sections) as SwitchableSection[]) {
    const status = sections[key]
    if (status) sections[key] = { ...status, enabled: settings.sections[key] }
  }
  return { ...admin, settings, sections: sections as PageSections }
}

// ── Reads ─────────────────────────────────────────────────────

export const usePageAdmin = (orgId: string) =>
  useQuery({
    queryKey: pageKeys.admin(orgId),
    queryFn: () => getPageAdminApi(orgId),
    enabled: !!orgId,
  })

// ── Settings ──────────────────────────────────────────────────

export const useUpdateContact = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: Partial<PageContact>) => updateContactApi(orgId, payload),
    onSuccess: (settings) => storeSettings(queryClient, orgId, settings),
  })
}

export const useUpdateFacts = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: PageFactsPayload) => updateFactsApi(orgId, payload),
    onSuccess: (settings) => storeSettings(queryClient, orgId, settings),
  })
}

/**
 * Optimistic: the switch moves at once. A refusal puts it back and says why; the
 * caller toasts the success, which knows which way it went.
 */
export const useUpdateSections = (orgId: string) => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (payload: Partial<Record<SwitchableSection, boolean>>) =>
      updateSectionsApi(orgId, payload),
    onMutate: async (payload) => {
      const key = pageKeys.admin(orgId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PageAdmin>(key)
      if (previous) {
        queryClient.setQueryData<PageAdmin>(
          key,
          withSettings(previous, {
            ...previous.settings,
            sections: { ...previous.settings.sections, ...payload },
          })
        )
      }
      return { previous }
    },
    onError: (err, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(pageKeys.admin(orgId), context.previous)
      toast.show({
        title: "Couldn't change that section",
        message: pageErrorSentence(err),
        variant: "error",
        position: "top-center",
      })
    },
    onSuccess: (settings) => storeSettings(queryClient, orgId, settings),
  })
}

// ── About ─────────────────────────────────────────────────────

/**
 * The About text is the org's description. The profile's cache takes the new text
 * at once (so the editor is no longer "changed"), then the profile and the hub are
 * refetched: "about" moves readiness.
 */
export const useUpdateAbout = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (description: string) => updateAboutApi(orgId, description),
    onSuccess: (_org, description) => {
      queryClient.setQueryData<OrganizationDetail>(orgKeys.detail(orgId), (old) =>
        old ? { ...old, description } : old
      )
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
      queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
    },
  })
}
