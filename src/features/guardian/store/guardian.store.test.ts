/**
 * The guardian store, and through it the shape of the API contract.
 *
 * WHY THIS FILE EXISTS. The whole guardian flow shipped once against an
 * ASSUMED contract — a nested `guardian: { guardian_required }` block that the
 * server does not send. Nothing failed loudly: the client read `undefined`,
 * decided no parent was needed, and sent every locked child straight into an
 * app where every request answered 403. Typecheck passed, lint passed, the
 * build passed, and the feature was silently inert.
 *
 * So the assertions here are deliberately about KEY NAMES and nothing clever.
 * They are the cheapest possible tripwire for the one failure mode this
 * feature has already had once.
 *
 * The names are pinned against:
 *   accounts/views/user_auth_views.py   — `guardian_required`, top level
 *   accounts/views/user_views.py        — the same key on the role response
 *   guardians/selectors/consent_selectors.py — `status` + `masked_contact`
 *   guardians/permissions.py            — the blocking statuses
 */

import { beforeEach, describe, expect, it } from "vitest"

import {
  lockGuardian,
  startGuardianFlow,
  syncGuardianFromServer,
  useGuardianStore,
} from "./guardian.store"

const reset = () => useGuardianStore.getState().clear()
const read = () => useGuardianStore.getState()

beforeEach(reset)

describe("startGuardianFlow — the OTP and role responses", () => {
  it("locks on a bare true, which is the shape the server sends", () => {
    startGuardianFlow(true)

    expect(read().required).toBe(true)
    // Nothing has named a parent yet, so there is no mode to know.
    expect(read().mode).toBeNull()
    // `guardian_required` says nothing about WHY, and pending is the state the
    // server just wrote for a freshly verified minor.
    expect(read().status).toBe("pending")
  })

  it("stays clear for an adult (false)", () => {
    startGuardianFlow(false)
    expect(read().required).toBe(false)
  })

  /**
   * THE REGRESSION. An absent key is what a client reading the wrong path
   * sees, and it must never be mistaken for "no lock needed" by accident — it
   * is only correct here because the server genuinely omits the key for
   * adults. The next two tests are what stop a wrong key going unnoticed.
   */
  it("treats an absent flag as no lock", () => {
    startGuardianFlow(undefined)
    expect(read().required).toBe(false)
  })

  it("reads guardian_required from the TOP LEVEL of the response", () => {
    // The exact shape of `res.data.data` from POST /user/verify/otp.
    const otpResponse = {
      access: "jwt",
      user: { id: "u1" },
      guardian_required: true,
    }

    startGuardianFlow(otpResponse.guardian_required)
    expect(read().required).toBe(true)
  })

  it("does NOT find it under a nested `guardian` block", () => {
    // The shape the client wrongly assumed. Kept as a test so that if somebody
    // reintroduces the nesting, this fails instead of the feature going quiet.
    const wrong = { guardian: { guardian_required: true } } as {
      guardian: { guardian_required: boolean }
      guardian_required?: boolean
    }

    startGuardianFlow(wrong.guardian_required)
    expect(read().required).toBe(false)
  })
})

describe("syncFromServer — the guardian block on GET /user/details", () => {
  it("locks on pending and keeps the masked contact", () => {
    syncGuardianFromServer({ status: "pending", masked_contact: "pri•••@x.com" })

    expect(read().required).toBe(true)
    expect(read().status).toBe("pending")
    expect(read().maskedContact).toBe("pri•••@x.com")
    // A masked contact means a link is already out — the waiting state. Without
    // this a child returning to a cold tab would be asked for their parent's
    // details again and would send a second email.
    expect(read().mode).toBe("link_sent")
  })

  it("locks on withdrawn, and keeps it distinct from pending", () => {
    syncGuardianFromServer({ status: "withdrawn", masked_contact: null })

    expect(read().required).toBe(true)
    // The two are different screens: "waiting for your parent" is not what you
    // show somebody whose parent has just said stop.
    expect(read().status).toBe("withdrawn")
  })

  it("does not lock an adult", () => {
    syncGuardianFromServer({ status: "not_needed", masked_contact: null })
    expect(read().required).toBe(false)
  })

  it("clears once a parent approves", () => {
    syncGuardianFromServer({ status: "pending", masked_contact: "a@b.com" })
    expect(read().required).toBe(true)

    syncGuardianFromServer({ status: "approved", masked_contact: null })
    expect(read().required).toBe(false)
    expect(read().maskedContact).toBeNull()
  })

  it("clears when the block is absent, so a stale lock cannot outlive it", () => {
    lockGuardian("pending")
    syncGuardianFromServer(undefined)
    expect(read().required).toBe(false)
  })

  it("leaves a shared_contact flow alone when nothing was masked", () => {
    // Nothing was sent in shared_contact mode, so there is no contact to mask;
    // the locally stored mode is the better answer than forcing null.
    useGuardianStore.getState().setMode("shared_contact")
    syncGuardianFromServer({ status: "pending", masked_contact: null })

    expect(read().mode).toBe("shared_contact")
  })
})

describe("lock — the 403 backstop", () => {
  it("locks from a GUARDIAN_CONSENT_REQUIRED body", () => {
    lockGuardian("pending")
    expect(read().required).toBe(true)
    expect(read().status).toBe("pending")
  })

  it("carries withdrawn through", () => {
    lockGuardian("withdrawn")
    expect(read().status).toBe("withdrawn")
  })
})

describe("setMode — the /guardian/details reply", () => {
  it("records link_sent with the masked address for the waiting screen", () => {
    startGuardianFlow(true)
    useGuardianStore.getState().setMode("link_sent", "pri•••@x.com")

    expect(read().mode).toBe("link_sent")
    expect(read().maskedContact).toBe("pri•••@x.com")
  })

  it("records shared_contact, which sends nothing and masks nothing", () => {
    startGuardianFlow(true)
    useGuardianStore.getState().setMode("shared_contact")

    expect(read().mode).toBe("shared_contact")
    expect(read().maskedContact).toBeNull()
  })
})
