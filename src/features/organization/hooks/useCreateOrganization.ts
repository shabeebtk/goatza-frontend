"use client"

/**
 * Creating a page, end to end.
 *
 *   1. POST /organizations/create (with the chosen handle) — the only step
 *      that can fail the whole thing; it rejects with a CreateOrgError.
 *   2. The logo, then the cover, through uploadOrgPhoto. Still acting as the
 *      PERSON: both name the new org explicitly. A photo that fails is NOT a
 *      failed create — the page exists — so it is noted and the person is told
 *      after landing, with a way to add it from the page.
 *   3. Land: the new org goes into the org list and the store, the actor
 *      switches to it, the org caches are invalidated, and the dashboard opens
 *      with a "<name> is live" toast.
 *
 * `phase` drives the button's words ("Creating your page…" → "Uploading
 * logo…" → "Uploading cover…" → "Opening your page…").
 */

import { useCallback, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { useAuthStore } from "@/store/auth.store"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  createOrganizationApi,
  getOrganizationsApi,
} from "../services/organization.api"
import { uploadOrgPhoto, type OrgPhotoType } from "../services/uploadOrgPhoto"
import type {
  CreatedOrganization,
  CreateOrganizationPayload,
  OrganizationMini,
} from "../types"
import { orgKeys } from "./useOrganizations"

export type CreatePhase = "creating" | "logo" | "cover" | "opening"

export type CreatePhoto = {
  /** The cropped image. */
  blob: Blob
  /** The picked file's name (only its extension is used). */
  name: string
}

export type CreateOrgInput = {
  payload: CreateOrganizationPayload
  logo?:   CreatePhoto | null
  cover?:  CreatePhoto | null
}

export type CreateOrgResult = {
  org:      CreatedOrganization
  logoUrl?: string
  /** The photos that did not make it; the page exists regardless. */
  failedPhotos: OrgPhotoType[]
}

export const createPhaseLabel: Record<CreatePhase, string> = {
  creating: "Creating your page…",
  logo:     "Uploading logo…",
  cover:    "Uploading cover…",
  opening:  "Opening your page…",
}

export function photoFailureMessage(failed: OrgPhotoType[]): string {
  const what =
    failed.length > 1 ? "the logo and cover" : failed[0] === "logo" ? "the logo" : "the cover"
  const them = failed.length > 1 ? "them" : "it"
  return `Your page is live, but ${what} didn't upload. Add ${them} from your page.`
}

export const useCreateOrganization = ({
  beforeLanding,
}: {
  /** Runs once the page exists, before anything navigates (the draft is cleared here). */
  beforeLanding?: () => void
} = {}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()
  const [phase, setPhase] = useState<CreatePhase | null>(null)

  const land = useCallback(
    async ({ org, logoUrl, failedPhotos }: CreateOrgResult) => {
      beforeLanding?.()

      const mini: OrganizationMini = {
        id:          org.id,
        name:        org.name,
        username:    org.username,
        type:        org.type,
        logo:        logoUrl ?? org.logo ?? "",
        headline:    org.headline ?? "",
        is_verified: false,
        my_role:     "owner",
      }

      // The fresh list carries my_permissions. If it can't be had, the new org
      // is added by hand so the dashboard's member guard lets the owner in.
      let organizations: OrganizationMini[] = []
      try {
        organizations = await getOrganizationsApi()
      } catch {
        organizations = []
      }
      if (!organizations.some((item) => item.id === org.id)) {
        organizations = [
          ...useAuthStore.getState().organizations.filter((item) => item.id !== org.id),
          mini,
        ]
      }

      const store = useAuthStore.getState()
      store.setOrganizations(organizations)
      store.switchToOrganization(org.id)

      queryClient.setQueryData(orgKeys.list(), organizations)
      void queryClient.invalidateQueries({ queryKey: orgKeys.all() })

      router.push(`/organization/admin/${org.id}/dashboard`)

      toast.show({
        title: `${org.name} is live`,
        variant: "success",
        action: {
          label: "View page",
          onClick: () => router.push(`/organization/admin/${org.id}/profile`),
        },
      })

      if (failedPhotos.length > 0) {
        toast.show({
          title: photoFailureMessage(failedPhotos),
          variant: "warning",
          duration: 8000,
        })
      }
    },
    [beforeLanding, queryClient, router, toast]
  )

  const mutation = useMutation({
    mutationFn: async ({ payload, logo, cover }: CreateOrgInput): Promise<CreateOrgResult> => {
      setPhase("creating")
      const org = await createOrganizationApi(payload)

      const failedPhotos: OrgPhotoType[] = []
      let logoUrl: string | undefined

      const photos: [OrgPhotoType, CreatePhoto | null | undefined][] = [
        ["logo", logo],
        ["cover", cover],
      ]
      for (const [type, photo] of photos) {
        if (!photo) continue
        setPhase(type)
        try {
          const url = await uploadOrgPhoto({
            orgId: org.id,
            type,
            blob: photo.blob,
            originalName: photo.name,
          })
          if (type === "logo") logoUrl = url
        } catch {
          // Reported by the upload helpers themselves; non-fatal here.
          failedPhotos.push(type)
        }
      }

      setPhase("opening")
      return { org, logoUrl, failedPhotos }
    },
    onSuccess: land,
    onError: () => setPhase(null),
  })

  return { ...mutation, phase }
}
