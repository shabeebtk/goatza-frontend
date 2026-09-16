import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type {
  GuardianConsentStatus,
  GuardianMode,
  GuardianRequestState,
  GuardianStatusBlock,
} from "../types"

/**
 * Where the child is in the guardian flow, between the OTP and the app.
 *
 * WHY A STORE AND NOT COMPONENT STATE. The email signup could hold this in
 * AuthCard — the OTP response and the step that follows it are two renders
 * apart. Nothing else can. The Google path finishes at the ROLE step
 * (`POST /user/role`), which lives in the onboarding modal on a different route
 * entirely; and a locked account can meet its 403 on any request in the app,
 * from any screen. All three write here, and one place reads it.
 *
 * THE SERVER IS THE AUTHORITY, always. Three things write to this store and all
 * three are the server talking:
 *
 *   1. `guardian_required` on the OTP / role response — the moment an account
 *      becomes real and is found to be a minor.
 *   2. The `guardian` block on GET /user/details — read at every session start
 *      and again whenever the waiting screen re-checks, which is what makes
 *      the flow survive a new tab or a cold boot and what tells a waiting
 *      child that their parent has answered.
 *   3. A 403 `GUARDIAN_CONSENT_REQUIRED` from any gated endpoint — the safety
 *      net for anything the first two missed.
 *
 * SESSION STORAGE, and it holds NO personal data — only which step you are on.
 * Not the parent's name, not their email; those go straight to the server from
 * the form that collects them and are never written to a child's device. The
 * masked address, the "same address you signed up with" flag and the request
 * state are all server-issued facts about the exchange, not about a person.
 * It survives a refresh and dies with the tab, and because route 2 above
 * re-establishes it from the server on every boot, losing it costs nothing.
 */

type GuardianFlowState = {
  /** True while the account is locked. False for adults and approved minors. */
  required: boolean
  /**
   * Why it is locked. `withdrawn` is not `pending`: a parent who has actively
   * taken permission back must not be chased by the same screen that nudges a
   * request nobody answered.
   */
  status: GuardianConsentStatus | null
  /**
   * Null until POST /guardian/details answers. The auth responses never carry
   * it — at OTP time no parent has been named, so there is no mode yet.
   */
  mode: GuardianMode | null
  /** The address a link went to, masked. Server-supplied, for the wait screen. */
  maskedContact: string | null
  /**
   * The parent's address is the child's own sign-up email. The waiting screen
   * words itself differently — there is no second inbox to go and check.
   */
  sameAsLoginContact: boolean
  /**
   * What the waiting screen should say about the standing request: still
   * waiting, the link expired, or the parent said no. Server-supplied; null
   * until a parent has been named.
   */
  requestState: GuardianRequestState | null

  /** From `guardian_required` on the OTP / role response. */
  start: (required: boolean | undefined) => void
  /** From the `guardian` block on GET /user/details. */
  syncFromServer: (block: GuardianStatusBlock | undefined) => void
  /** From a 403 GUARDIAN_CONSENT_REQUIRED on any gated request. */
  lock: (status: GuardianConsentStatus) => void
  /** From POST /guardian/details and POST /guardian/resend. */
  setMode: (
    mode: GuardianMode,
    maskedContact?: string | null,
    sameAsLoginContact?: boolean,
  ) => void
  /** Approval landed. */
  clear: () => void
}

const CLEARED = {
  required: false,
  status: null,
  mode: null,
  maskedContact: null,
  sameAsLoginContact: false,
  requestState: null,
} as const

export const useGuardianStore = create<GuardianFlowState>()(
  persist(
    (set, get) => ({
      ...CLEARED,

      start: (required) => {
        if (!required) {
          set(CLEARED)
          return
        }
        // `guardian_required` is a bare boolean and says nothing about WHY, so
        // the opening assumption is `pending` — which is what the server just
        // wrote for a freshly verified minor. /user/details corrects it to
        // `withdrawn` on the next boot if that is what it really is.
        set({ required: true, status: get().status ?? "pending" })
      },

      syncFromServer: (block) => {
        if (!block || !["pending", "withdrawn"].includes(block.status)) {
          set(CLEARED)
          return
        }

        set({
          required: true,
          status: block.status,
          maskedContact: block.masked_contact,
          /*
            A masked contact means a parent HAS been named and a link is out —
            which is the waiting state, and the server is the only side that
            knows it. Without this, a child who closes the tab mid-wait and
            comes back would be asked for their parent's details a second time
            and send a second email. No masked contact means nobody has been
            named yet, and the details form is the right screen — there is no
            other mode a link could be in.
          */
          mode: block.masked_contact ? "link_sent" : null,
          /*
            Defaulted, not trusted to be present: the backend may deploy ahead
            of this client, and an older block without these keys must read as
            the plain waiting state it always was.
          */
          sameAsLoginContact: block.same_as_login_contact === true,
          requestState: block.request_state ?? null,
        })
      },

      lock: (status) =>
        set({ required: true, status }),

      setMode: (mode, maskedContact = null, sameAsLoginContact = false) =>
        set({
          required: true,
          mode,
          maskedContact,
          sameAsLoginContact,
          // A fresh link has just gone out, so whatever the last one was —
          // expired, declined — the child is waiting again.
          requestState: "waiting",
        }),

      clear: () => set(CLEARED),
    }),
    {
      name: "goatza:guardian:flow",
      storage: createJSONStorage(() => sessionStorage),

      /*
        AN ALLOW-LIST, not a convenience.

        Zustand would already skip the actions, so today this changes nothing —
        which is exactly when it is worth writing. The next field added to this
        store gets persisted by default unless somebody remembers not to, and on
        a store that sits between a minor and their parent's details, the field
        somebody forgets is the one that matters.
      */
      partialize: (state) => ({
        required: state.required,
        status: state.status,
        mode: state.mode,
        maskedContact: state.maskedContact,
        sameAsLoginContact: state.sameAsLoginContact,
        requestState: state.requestState,
      }),
    },
  ),
)

/**
 * Imperative entry points for code that is not a React component — the auth
 * mutations' `onSuccess` callbacks and the axios interceptor, none of which can
 * call a hook. Same reason `requireLegalConsent` exists next door.
 */
export const startGuardianFlow = (required: boolean | undefined) =>
  useGuardianStore.getState().start(required)

export const syncGuardianFromServer = (block: GuardianStatusBlock | undefined) =>
  useGuardianStore.getState().syncFromServer(block)

export const lockGuardian = (status: GuardianConsentStatus) =>
  useGuardianStore.getState().lock(status)
