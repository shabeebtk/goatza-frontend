import { useMutation } from "@tanstack/react-query"
import { loginApi } from "../services/auth.api"
import { useAuthStore } from "@/store/auth.store"

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: loginApi,
    onSuccess: (data) => {
      setAuth({
        token: data.access,
        user: data.user,
      })
    },
  })
}