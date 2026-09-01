import { useMutation } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"

import {
  submitProblemReportApi,
  type ProblemReportPayload,
} from "../services/support.api"

/**
 * File a problem report.
 *
 * Invalidates NOTHING, and there is no query key for this feature at all:
 * nothing in the app reads problem reports back. The report leaves and the
 * only thing that ever comes of it is a fix or an email — neither of which is
 * cache state.
 *
 * No success toast either: the sheet owns that moment with its own
 * confirmation step, which is also the only place the reference code is shown.
 * A toast sliding in over it would be the same message twice, and the code
 * would scroll away in four seconds.
 *
 * Errors ARE handled here so every entry point gets the same words. 429 is
 * called out separately because it is the one failure with a specific remedy —
 * wait — while everything else is "try again". Same split as `useReport`.
 */
export const useSubmitProblemReport = () => {
  const toast = useToast()

  return useMutation({
    mutationFn: (payload: ProblemReportPayload) =>
      submitProblemReportApi(payload),

    onError: (error: unknown) => {
      const status =
        typeof error === "object" && error !== null && "response" in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined

      if (status === 429) {
        toast.show({
          title: "You've sent a few of these. Try again later.",
          variant: "warning",
          icon: "mdi:timer-sand",
          position: "top-right",
          duration: 5000,
        })
        return
      }

      toast.show({
        title: "Couldn't send this report",
        message: "Try again.",
        variant: "error",
        position: "top-right",
        duration: 4000,
      })
    },
  })
}
