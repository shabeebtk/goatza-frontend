import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuthStore } from "@/store/auth.store"
import {
  getPhoneApi,
  updatePhoneApi,
  type PhoneResponse,
} from "../services/phoneChange.api"

export const phoneKeys = {
  mine: () => ["settings", "phone"] as const,
}

/**
 * The number on file, for the form's prefill.
 *
 * Its own query rather than a field off useMyProfile, because `phone` is in no
 * user serializer — see the note on phoneChange.api.ts. `staleTime: 0` so
 * coming back to the screen after a save shows what was saved, not a cached
 * older value; the endpoint is a single indexed row read.
 */
export const useMyPhone = () =>
  useQuery({
    queryKey: phoneKeys.mine(),
    queryFn: getPhoneApi,
    staleTime: 0,
  })

/**
 * Save (or, with `null`, remove) the number.
 *
 * `retry: false`: this is a write against a unique column, and a retried save
 * would race its own first attempt into a "already in use" that is really the
 * user's own row.
 */
export const useUpdatePhone = () => {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  return useMutation({
    mutationFn: (phone: string | null) => updatePhoneApi(phone),
    retry: false,
    onSuccess: (data: PhoneResponse) => {
      queryClient.setQueryData(phoneKeys.mine(), data)

      // The store carries a `phone` the login payloads never populate; keeping
      // it right here costs nothing and means anything that starts reading it
      // is not reading a value from before the save.
      if (user) updateUser({ ...user, phone: data.phone })
    },
  })
}
