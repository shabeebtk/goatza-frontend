/**
 * The signup mutation.
 *
 * Two things it deliberately does NOT do:
 *
 *   * It does not clear the form. Every failure path leaves what somebody typed
 *     exactly where they typed it — this is a nine-field form on a phone
 *     keyboard, and re-entering it is how a signup gets lost.
 *   * It does not toast validation failures. Those belong on the field that
 *     caused them (the form maps `fieldErrors` back onto its inputs); a toast
 *     would announce a problem while hiding where it is.
 *
 * A network failure is the one case with no field to point at, so that is the
 * one that toasts.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { JoinApiError, joinWaitlist } from "../services/join.api"
import type { SignupPayload, SignupResult, WaitlistStats } from "../types"
import { joinKeys } from "./useWaitlistStats"

export function useJoinWaitlist() {
  const queryClient = useQueryClient()

  return useMutation<SignupResult, unknown, SignupPayload>({
    mutationFn: joinWaitlist,

    onSuccess: (result) => {
      // The counter should already include this person by the time the success
      // screen paints. An `already_registered` result changed nothing on the
      // server, so it must not move the number either.
      if (!result.already_registered) {
        queryClient.setQueryData<WaitlistStats>(joinKeys.stats(), (previous) =>
          previous ? { ...previous, count: previous.count + 1 } : previous,
        )
      }

      queryClient.invalidateQueries({ queryKey: joinKeys.stats() })
    },

    onError: (error) => {
      // A refused request carries a message the form renders against the right
      // field, so it stays silent here. The throttle is the exception: there is
      // no field at fault and nothing to correct, only a wait.
      if (error instanceof JoinApiError) {
        if (error.status === 429) toast.error(error.message)
        return
      }

      toast.error("Couldn't reach us just now.", {
        description:
          "Check your connection and tap register again — nothing you typed is lost.",
      })
    },
  })
}
