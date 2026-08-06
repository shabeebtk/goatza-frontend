import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { orgKeys } from "@/features/organization/hooks/useOrganizations"
import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import type { OrganizationDetail } from "@/features/organization/types"
import type { UserProfile } from "@/features/profile/services/profile.api"
import {
  updateOrgPublicProfileApi,
  updatePublicProfileApi,
} from "../services/settings.api"

/**
 * The public-profile toggle, optimistic with rollback.
 *
 * Optimistic because a switch that waits for a round trip before moving feels
 * broken, and this write is trivially reversible: the failure path puts the
 * switch back exactly where it was and says so, which is the whole contract.
 */
export const useTogglePublicProfile = () => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (isPublic: boolean) => updatePublicProfileApi(isPublic),

    onMutate: async (isPublic) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.me() })
      const previous = queryClient.getQueryData<UserProfile>(profileKeys.me())

      queryClient.setQueryData<UserProfile & { is_public_profile?: boolean }>(
        profileKeys.me(),
        (old) => (old ? { ...old, is_public_profile: isPublic } : old)
      )

      return { previous }
    },

    onError: (_error, _isPublic, context) => {
      if (context?.previous) {
        queryClient.setQueryData(profileKeys.me(), context.previous)
      }
      toast.show({
        title: "Couldn't update your privacy setting",
        variant: "error",
        position: "top-center",
        duration: 4000,
      })
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() })
    },
  })
}

/**
 * Same toggle for an organization.
 *
 * A rejection here is expected, not exceptional: a coach or staff member whose
 * client is out of date will get a 403, and the message names the reason rather
 * than showing the generic failure copy.
 */
export const useToggleOrgPublicProfile = (orgId: string) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = orgKeys.detail(orgId)

  return useMutation({
    mutationFn: (isPublic: boolean) => updateOrgPublicProfileApi(isPublic),

    onMutate: async (isPublic) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<OrganizationDetail>(key)

      queryClient.setQueryData<
        OrganizationDetail & { is_public_profile?: boolean }
      >(key, (old) => (old ? { ...old, is_public_profile: isPublic } : old))

      return { previous }
    },

    onError: (error, _isPublic, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous)
      }

      const status = (error as { response?: { status?: number } })?.response
        ?.status

      toast.show({
        title:
          status === 403
            ? "Only the owner or an admin can change this"
            : "Couldn't update the privacy setting",
        variant: "error",
        position: "top-center",
        duration: 4000,
      })
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
