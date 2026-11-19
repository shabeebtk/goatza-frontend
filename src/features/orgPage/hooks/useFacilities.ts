"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  addFacilityPhotoApi,
  deleteFacilityPhotoApi,
  getFacilitiesApi,
  reorderFacilityPhotosApi,
  saveLocationFacilitiesApi,
} from "../services/orgPage.api"
import { uploadOrgPagePhoto } from "../services/uploadOrgPagePhoto"
import type { FacilityPhoto, LocationFacilities, PageFacilities } from "../types"
import { pageKeys } from "./useOrgPage"
import { inOrder, useOptimisticReorder } from "./reorder"
import { invalidateShowcases } from "./usePageShowcase"

/** The most photos one branch holds. */
export const MAX_FACILITY_PHOTOS = 12
/** The most of the club's own words one branch holds. */
export const MAX_CUSTOM_FACILITIES = 10

export const useFacilities = (orgId: string) =>
  useQuery({
    queryKey: pageKeys.facilities(orgId),
    queryFn: () => getFacilitiesApi(orgId),
    enabled: !!orgId,
  })

/** The branch as the server now has it, into the cache; the hub follows. */
function useStoreBranch(orgId: string) {
  const queryClient = useQueryClient()
  return (branch: LocationFacilities | ((old: LocationFacilities) => LocationFacilities), locationId: string) => {
    queryClient.setQueryData<PageFacilities>(pageKeys.facilities(orgId), (old) =>
      old
        ? {
            ...old,
            locations: old.locations.map((existing) =>
              existing.location.id === locationId
                ? typeof branch === "function"
                  ? branch(existing)
                  : branch
                : existing
            ),
          }
        : old
    )
    queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
    invalidateShowcases(queryClient)
  }
}

export const useSaveLocationFacilities = (orgId: string, locationId: string) => {
  const store = useStoreBranch(orgId)
  return useMutation({
    mutationFn: (payload: { items: string[]; custom_items: string[] }) =>
      saveLocationFacilitiesApi(orgId, locationId, payload),
    onSuccess: (branch) => store(branch, locationId),
  })
}

/** Crop → upload as "org_page" → attach to the branch. */
export const useAddFacilityPhoto = (orgId: string, locationId: string) => {
  const store = useStoreBranch(orgId)
  return useMutation({
    mutationFn: async ({ blob, originalName }: { blob: Blob; originalName: string }) => {
      const photo = await uploadOrgPagePhoto({ orgId, blob, originalName })
      return addFacilityPhotoApi(orgId, locationId, photo)
    },
    onSuccess: (branch) => store(branch, locationId),
  })
}

export const useDeleteFacilityPhoto = (orgId: string, locationId: string) => {
  const store = useStoreBranch(orgId)
  return useMutation({
    mutationFn: (photoId: string) => deleteFacilityPhotoApi(orgId, photoId),
    onSuccess: (_answer, photoId) =>
      store(
        (branch) => ({ ...branch, photos: branch.photos.filter((photo) => photo.id !== photoId) }),
        locationId
      ),
  })
}

export const useReorderFacilityPhotos = (orgId: string, locationId: string) => {
  const queryClient = useQueryClient()
  const withPhotos = (data: PageFacilities, order: (photos: FacilityPhoto[]) => FacilityPhoto[]) => ({
    ...data,
    locations: data.locations.map((branch) =>
      branch.location.id === locationId ? { ...branch, photos: order(branch.photos) } : branch
    ),
  })

  return useOptimisticReorder<PageFacilities, FacilityPhoto[]>({
    queryKey: pageKeys.facilities(orgId),
    reorder: (data, ids) => withPhotos(data, (photos) => inOrder(photos, ids)),
    send: (ids) => reorderFacilityPhotosApi(orgId, locationId, ids),
    onAnswer: (photos) =>
      queryClient.setQueryData<PageFacilities>(pageKeys.facilities(orgId), (old) =>
        old ? withPhotos(old, () => photos) : old
      ),
  })
}
