import { create } from "zustand"

/**
 * Whether the re-consent modal is up, and which documents it is asking about.
 *
 * A STORE rather than component state, because the two things that raise it
 * live in different worlds:
 *
 *   1. Session start — a React component reads `legal.pending_documents` off
 *      the user and calls `require()`.
 *   2. A 403 from anywhere — the axios interceptor, which is not a component
 *      and cannot use hooks. It reaches this the same way it already reaches
 *      the auth store: `useLegalConsentStore.getState()`.
 *
 * In-memory only, deliberately. Nothing about a consent prompt should survive
 * a reload: on the next load the server says again whether anything is
 * pending, and the server is the only thing that knows.
 */

type LegalConsentState = {
  /** Document keys the server says are outstanding. Empty means nothing owed. */
  pendingDocuments: string[]
  open: boolean

  /**
   * Raise the modal for these documents. Safe to call repeatedly — a burst of
   * parallel requests all answering 403 is the normal case, not an edge one,
   * and it must not produce a flicker or reset a submit in flight.
   */
  require: (documents: string[]) => void

  /** Consent recorded (or the user logged out). Take it down. */
  clear: () => void
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

export const useLegalConsentStore = create<LegalConsentState>((set, get) => ({
  pendingDocuments: [],
  open: false,

  require: (documents) => {
    const next = (documents ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    )

    if (next.length === 0) return

    // No-op when it is already up for the same documents, so ten concurrent
    // 403s are one modal and one render, not ten.
    const { open, pendingDocuments } = get()
    if (open && sameList(pendingDocuments, next)) return

    set({ pendingDocuments: next, open: true })
  },

  clear: () => set({ pendingDocuments: [], open: false }),
}))

/**
 * The interceptor's entry point. A plain function so the axios module does not
 * import a hook it cannot call.
 */
export const requireLegalConsent = (documents: string[]) =>
  useLegalConsentStore.getState().require(documents)
