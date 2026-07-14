import { create } from "zustand"
import type { UserRole } from "@/shared/constants/roles"

/**
 * The one place onboarding state lives (per the feature contract). Holds the
 * working step, the branch chosen at step 1, and per-step draft values — nothing
 * about *whether* the modal shows (that's the gate's job, driven by auth flags +
 * the sessionStorage dismiss flag).
 *
 * In-memory only: reopening onboarding (next login) always starts clean.
 */

// Session flag that keeps a "Skip for now" from re-opening onboarding within the
// same browser tab session. Cleared naturally when the tab/session ends.
export const ONBOARDING_DISMISSED_KEY = "goatza_onboarding_dismissed"

export type OnboardingStepId =
  | "role"
  | "identity"
  | "sports"
  | "details"
  | "preview"
  | "success"

export type OnboardingBranch = "player" | "other"

// The player branch is the full 5-step flow; every other role does identity then
// finishes (the rest of their flow comes in a later stage).
const PLAYER_FLOW: OnboardingStepId[] = [
  "role",
  "identity",
  "sports",
  "details",
  "preview",
  "success",
]
const OTHER_FLOW: OnboardingStepId[] = ["role", "identity", "success"]

const branchForRole = (role: UserRole | null): OnboardingBranch =>
  role === "player" ? "player" : "other"

export const flowForBranch = (branch: OnboardingBranch): OnboardingStepId[] =>
  branch === "player" ? PLAYER_FLOW : OTHER_FLOW

type StepDrafts = Record<string, unknown>

type OnboardingState = {
  active: boolean
  stepIndex: number
  role: UserRole | null
  branch: OnboardingBranch
  drafts: Partial<Record<OnboardingStepId, StepDrafts>>
  dismissed: boolean
  // True while a nested editor (e.g. the photo cropper) is open over a step, so the
  // modal's Escape handler defers to it instead of opening the close-warning.
  nestedOpen: boolean

  // Derived helpers
  steps: () => OnboardingStepId[]
  currentStep: () => OnboardingStepId

  // Flow control
  start: (initialRole: UserRole | null) => void
  setRole: (role: UserRole) => void
  next: () => void
  back: () => void
  goTo: (index: number) => void
  setDraft: (step: OnboardingStepId, values: StepDrafts) => void

  setNestedOpen: (open: boolean) => void

  // Lifecycle: `active` (not the auth flag) drives whether the modal is mounted,
  // so the Success screen keeps showing even after is_onboarding_completed flips.
  finish: () => void

  // Dismissal (mirrors the sessionStorage flag so reads stay reactive)
  hydrateDismissed: () => void
  dismiss: () => void

  // Full reset for a genuine auth transition (login / signup-verify / google /
  // logout): clears drafts + lifecycle AND the sessionStorage skip flag, so the
  // next login re-evaluates onboarding. NOT called on page-refresh bootstrap, so a
  // "Skip for now" still survives a refresh within the same session.
  resetSession: () => void

  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  active: false,
  stepIndex: 0,
  role: null,
  branch: "other",
  drafts: {},
  dismissed: false,
  nestedOpen: false,

  steps: () => flowForBranch(get().branch),
  currentStep: () => {
    const { stepIndex } = get()
    const steps = flowForBranch(get().branch)
    return steps[Math.min(stepIndex, steps.length - 1)]
  },

  start: (initialRole) =>
    set({
      active: true,
      stepIndex: 0,
      role: initialRole,
      branch: branchForRole(initialRole),
      drafts: {},
    }),

  // Changing the role at step 1 can flip the branch (player ↔ other), which
  // resizes the flow. We stay on step 1 (index 0) so that's always safe.
  setRole: (role) =>
    set({
      role,
      branch: branchForRole(role),
    }),

  next: () =>
    set((state) => {
      const steps = flowForBranch(state.branch)
      return { stepIndex: Math.min(state.stepIndex + 1, steps.length - 1) }
    }),

  back: () =>
    set((state) => ({ stepIndex: Math.max(state.stepIndex - 1, 0) })),

  goTo: (index) =>
    set((state) => {
      const steps = flowForBranch(state.branch)
      return { stepIndex: Math.max(0, Math.min(index, steps.length - 1)) }
    }),

  setDraft: (step, values) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [step]: { ...(state.drafts[step] ?? {}), ...values },
      },
    })),

  setNestedOpen: (open) => set({ nestedOpen: open }),

  // Explicit end of the flow (Success "Go to your feed"). Tears the modal down
  // without touching the sessionStorage dismiss flag.
  finish: () => set({ active: false, nestedOpen: false }),

  hydrateDismissed: () => {
    if (typeof window === "undefined") return
    const flag = window.sessionStorage.getItem(ONBOARDING_DISMISSED_KEY)
    set({ dismissed: flag === "1" })
  },

  dismiss: () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")
    }
    set({ active: false, dismissed: true })
  },

  resetSession: () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ONBOARDING_DISMISSED_KEY)
    }
    set({
      active: false,
      dismissed: false,
      nestedOpen: false,
      stepIndex: 0,
      role: null,
      branch: "other",
      drafts: {},
    })
  },

  reset: () =>
    set({
      active: false,
      stepIndex: 0,
      role: null,
      branch: "other",
      drafts: {},
    }),
}))
