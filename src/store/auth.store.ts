import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { OrganizationMini } from "@/features/organization/types"
import type { UserRole } from "@/shared/constants/roles"

export type ActorType = "user" | "organization"

export type User = {
  id: string
  username: string
  email?: string | null
  name?: string
  phone?: string | null
  profile_photo?: string
  role?: UserRole
  is_role_confirmed?: boolean
  is_onboarding_completed?: boolean
  /**
   * Present only on the user from GET /user/details. The login, OTP and Google
   * responses serialise a user without it, so `undefined` means "not known
   * yet" — never "nothing pending". See LegalConsentGate.
   */
  legal?: {
    pending_documents: string[]
    requires_acceptance: boolean
    accepted_versions: Record<string, string | null>
  }
}

export type OrganizationActor = OrganizationMini

const ORG_ADMIN_ROUTE_REGEX = /^\/organization\/admin\/([^/?#]+)/

const findOrgById = (
  organizations: OrganizationActor[],
  id: string | null
) => {
  if (!id) return null
  return organizations.find((org) => org.id === id) ?? null
}

const uniqueOrganizations = (organizations: OrganizationActor[]) => {
  const seen = new Set<string>()
  return organizations.filter((org) => {
    if (!org.id || seen.has(org.id)) return false
    seen.add(org.id)
    return true
  })
}

type AuthState = {
  // MEMORY ONLY (not persisted)
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  // actor context
  actorType: ActorType
  actorId: string | null
  organizations: OrganizationActor[]
  currentOrganization: OrganizationActor | null
  isOrgAdminView: boolean

  // ACTIONS
  setLoading: (value: boolean) => void

  setSession: (payload: {
    token: string
    user: User
  }) => void

  updateAccessToken: (token: string) => void

  updateUser: (user: User) => void

  setUserRole: (role: UserRole) => void

  setOnboardingCompleted: () => void

  setOrganizations: (organizations: OrganizationActor[]) => void

  upsertOrganization: (organization: OrganizationActor) => void

  removeOrganization: (organizationId: string) => void

  switchToUser: () => void

  switchToOrganization: (organizationId: string) => void

  syncActorFromPath: (pathname: string) => void

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

      // ACTOR CONTEXT
      actorType: "user",
      actorId: null,
      organizations: [],
      currentOrganization: null,
      isOrgAdminView: false,

      // -------------------
      // ACTIONS
      // -------------------

      setLoading: (value) =>
        set({
          isLoading: value,
        }),

      setSession: ({ token, user }) =>
        set((state) => ({
          accessToken: token,
          user,
          isAuthenticated: true,
          isLoading: false,
          currentOrganization:
            state.actorType === "organization"
              ? findOrgById(state.organizations, state.actorId)
              : null,
        })),

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

      // Set the role once (after the onboarding /user/role call succeeds) and mark
      // it confirmed, in place, without disturbing the rest of the session.
      setUserRole: (role) =>
        set((state) =>
          state.user
            ? { user: { ...state.user, role, is_role_confirmed: true } }
            : state
        ),

      // Flip the onboarding flag in place once /user/onboarding/complete succeeds,
      // so the onboarding gate stops showing the modal without a full re-fetch.
      setOnboardingCompleted: () =>
        set((state) =>
          state.user
            ? { user: { ...state.user, is_onboarding_completed: true } }
            : state
        ),

      setOrganizations: (organizations) =>
        set((state) => {
          const nextOrganizations = uniqueOrganizations(organizations)
          const nextCurrentOrganization =
            state.actorType === "organization"
              ? findOrgById(nextOrganizations, state.actorId)
              : null

          if (state.actorType === "organization" && state.actorId && !nextCurrentOrganization) {
            return {
              organizations: nextOrganizations,
              actorType: "user" as const,
              actorId: null,
              currentOrganization: null,
              isOrgAdminView: false
            }
          }

          return {
            organizations: nextOrganizations,
            currentOrganization: nextCurrentOrganization,
          }
        }),

      upsertOrganization: (organization) =>
        set((state) => {
          const exists = state.organizations.some((org) => org.id === organization.id)
          const nextOrganizations = exists
            ? state.organizations.map((org) =>
              org.id === organization.id ? organization : org
            )
            : [organization, ...state.organizations]

          return {
            organizations: nextOrganizations,
            currentOrganization:
              state.actorType === "organization"
                ? findOrgById(nextOrganizations, state.actorId)
                : null,
          }
        }),

      removeOrganization: (organizationId) =>
        set((state) => {
          const nextOrganizations = state.organizations.filter(
            (org) => org.id !== organizationId
          )

          if (state.actorType === "organization" && state.actorId === organizationId) {
            return {
              organizations: nextOrganizations,
              actorType: "user" as const,
              actorId: null,
              currentOrganization: null,
              isOrgAdminView: false
            }
          }

          return {
            organizations: nextOrganizations,
            currentOrganization:
              state.actorType === "organization"
                ? findOrgById(nextOrganizations, state.actorId)
                : null,
          }
        }),

      switchToUser: () =>
        set((state) => {
          if (state.actorType === "user" && !state.actorId && !state.currentOrganization) {
            return state
          }

          return {
            actorType: "user" as const,
            actorId: null,
            currentOrganization: null,
            isOrgAdminView: false
          }
        }),

      switchToOrganization: (organizationId) =>
        set((state) => {
          const nextOrgId = organizationId?.trim()
          if (!nextOrgId) return state

          return {
            actorType: "organization" as const,
            actorId: nextOrgId,
            currentOrganization: findOrgById(state.organizations, nextOrgId),
          }
        }),

      syncActorFromPath: (pathname) =>
        set((state) => {
          if (!pathname) return state

          const match = pathname.match(ORG_ADMIN_ROUTE_REGEX)

          if (match?.[1]) {
            const orgId = decodeURIComponent(match[1])

            if (state.actorType === "organization" && state.actorId === orgId) {
              return {
                currentOrganization: findOrgById(state.organizations, orgId),
                isOrgAdminView: true,   
              }
            }

            return {
              actorType: "organization" as const,
              actorId: orgId,
              currentOrganization: findOrgById(state.organizations, orgId),
              isOrgAdminView: true,   
            }
          }

          if (state.actorType === "user" && !state.actorId && !state.currentOrganization) {
            return state
          }

          return {
            actorType: "user" as const,
            actorId: null,
            currentOrganization: null,
            isOrgAdminView: false
          }
        }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          actorType: "user",
          actorId: null,
          organizations: [],
          currentOrganization: null,
          isOrgAdminView: false
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
        state.organizations = []
        state.currentOrganization = null
      },
    }
  )
)
