"use client"

/**
 * The owner's CV settings — read once, patched one toggle at a time.
 *
 * The mutation is optimistic with rollback, exactly as `useTogglePublicProfile`
 * does it and for the same reason: a switch that waits for a round trip before
 * moving feels broken, and this write is trivially reversible.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  getCVSettingsApi,
  updateCVSettingsApi,
  type CVSettings,
  type CVSettingsPatch,
} from "../services/cv.api"

export const cvKeys = {
  settings: () => ["cv", "settings"] as const,
}

/**
 * `enabled` is opt-out: the settings screen always wants this, but the profile
 * share menu only wants it for the owner, and only once the menu is open —
 * the GET get-or-creates a row server-side, so firing it for every visitor
 * would write a row for anybody who merely looked at a share button.
 *
 * `retry: false` because the interesting failure is a 403 (a coach or scout has
 * no CV), and retrying a settled permission answer three times only delays the
 * message.
 */
export const useCVSettings = (enabled = true) =>
  useQuery({
    queryKey: cvKeys.settings(),
    queryFn: getCVSettingsApi,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  })

export const useUpdateCVSettings = () => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = cvKeys.settings()

  return useMutation({
    mutationFn: (patch: CVSettingsPatch) => updateCVSettingsApi(patch),

    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CVSettings>(key)

      queryClient.setQueryData<CVSettings>(key, (old) =>
        old ? { ...old, ...patch } : old
      )

      return { previous }
    },

    onError: (_error, _patch, context) => {
      // Put the switch back exactly where it was, and say so. A switch that
      // silently stayed moved would tell the owner their phone number is
      // hidden when it is still on a public page.
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous)
      }

      toast.show({
        title: "Couldn't update your CV setting",
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
