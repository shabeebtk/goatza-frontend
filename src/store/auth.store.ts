import { create } from "zustand"

type User = {
  id: string
  username: string
  email?: string
}

type ActorType = "user" | "organization"

type AuthState = {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  setLoading: (val: boolean) => void

  actorType: ActorType
  actorId: string | null

  setAuth: (data: { token: string; user?: User | null }) => void
  setActor: (actor: { type: ActorType; id?: string | null }) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // start loading true

  actorType: "user",
  actorId: null,

  setLoading: (val) => set({ isLoading: val }),

  setAuth: ({ token, user }) =>
    set((state) => ({
      accessToken: token,
      user: user ?? state.user,
      isAuthenticated: true,
    })),

  setActor: ({ type, id }) =>
    set({
      actorType: type,
      actorId: id ?? null,
    }),

  clearAuth: () =>
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false, // stop loading
      actorType: "user",
      actorId: null,
    }),
}))