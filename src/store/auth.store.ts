import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type ActorType = "user" | "organization"

export type User = {
  id: string
  username: string
  email?: string
  name?: string
  profile_photo?: string
}

type AuthState = {
  // MEMORY ONLY (not persisted)
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  // SAFE TO PERSIST
  actorType: ActorType
  actorId: string | null

  // ACTIONS
  setLoading: (value: boolean) => void

  setSession: (payload: {
    token: string
    user: User
  }) => void

  updateAccessToken: (token: string) => void

  updateUser: (user: User) => void

  switchToUser: () => void

  switchToOrganization: (organizationId: string) => void

  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // MEMORY ONLY
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      // PERSISTED
      actorType: "user",
      actorId: null,

      // -------------------
      // ACTIONS
      // -------------------

      setLoading: (value) =>
        set({
          isLoading: value,
        }),

      setSession: ({ token, user }) =>
        set({
          accessToken: token,
          user,
          isAuthenticated: true,
          isLoading: false,
        }),

      updateAccessToken: (token) =>
        set((state) => ({
          accessToken: token,
          isAuthenticated: !!state.user,
        })),

      updateUser: (user) =>
        set({
          user,
          isAuthenticated: true,
        }),

      switchToUser: () =>
        set({
          actorType: "user",
          actorId: null,
        }),

      switchToOrganization: (organizationId) =>
        set({
          actorType: "organization",
          actorId: organizationId,
        }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          actorType: "user",
          actorId: null,
        }),
    }),
    {
      name: "goatza-auth",

      storage: createJSONStorage(() => localStorage),

      // SAFE VALUES PERSISTED
      partialize: (state) => ({
        actorType: state.actorType,
        actorId: state.actorId,
      }),

      // ensure memory values reset on rehydrate
      onRehydrateStorage: () => (state) => {
        if (!state) return

        state.accessToken = null
        state.user = null
        state.isAuthenticated = false
        state.isLoading = true
      },
    }
  )
)