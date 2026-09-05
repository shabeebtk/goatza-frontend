import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import {
  confirmAccountDeleteApi,
  initiateAccountDeleteApi,
  readAccountDeleteError,
  type AccountDeleteConfirmPayload,
  type AccountDeleteFailure,
  type AccountDeleteMethod,
} from "../services/accountDeletion.api"

/** What the modal is showing while step 1 resolves. */
export type InitiateState =
  | { phase: "loading" }
  | { phase: "ready"; method: AccountDeleteMethod; sentTo?: string }
  | { phase: "failed"; failure: AccountDeleteFailure }

/**
 * Step 1 — ask which credential this account confirms with, exactly once.
 *
 * NOT a useMutation, and that is the whole point. This call has to fire from a
 * mount effect (opening the modal IS the trigger), and in React's dev
 * StrictMode a mount effect runs → cleans up → runs again. React Query
 * detaches its mutation observer during that cycle, so a result that arrives
 * afterwards is delivered to an observer nobody is listening to any more: the
 * request succeeds, the component never re-renders, and the modal sits on its
 * spinner for ever. Owning the state here sidesteps the observer entirely.
 *
 * Fires once per mount (the ref), never retries, and deliberately has no
 * cancellation flag — cancelling on StrictMode's throwaway cleanup would
 * discard the only response the guarded effect will ever produce. Both matter:
 * initiate mails a code and spends one of three attempts per hour shared with
 * confirm (accounts/throttles.py::AccountDeleteThrottle).
 */
export const useInitiateAccountDelete = (): InitiateState => {
  const [state, setState] = useState<InitiateState>({ phase: "loading" })
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    initiateAccountDeleteApi().then(
      (data) =>
        setState(
          data.method === "otp"
            ? { phase: "ready", method: "otp", sentTo: data.sent_to }
            : { phase: "ready", method: "password" }
        ),
      (err) => setState({ phase: "failed", failure: readAccountDeleteError(err) })
    )
  }, [])

  return state
}

/**
 * Step 2 — confirm and go.
 *
 * A real mutation, and safe as one: this fires from a click, long after the
 * mount cycle above has settled, so its observer is attached the whole time.
 *
 * No onSuccess: the session teardown is sequenced by the caller (see
 * DeleteAccountModal), because clearing the auth store is what makes AuthGuard
 * redirect, and that has to happen after the farewell has been seen rather
 * than the instant the response lands.
 */
export const useConfirmAccountDelete = () =>
  useMutation({
    mutationFn: (payload: AccountDeleteConfirmPayload) =>
      confirmAccountDeleteApi(payload),
    retry: false,
  })
