/**
 * The shapes the guardian flow moves around.
 *
 * EVERY NAME HERE MATCHES THE BACKEND'S OWN. Where they once did not — the flow
 * was built against an assumed contract before the API landed — the parent
 * screen silently never appeared, because the client was reading a key the
 * server does not send. So: `guardians/views/consent_views.py`,
 * `guardians/selectors/consent_selectors.py` and
 * `guardians/permissions.py` are the source of truth for this file, and a
 * rename on either side has to happen on both.
 */

/**
 * Where an account stands with its guardian.
 *
 * Mirrors `accounts.models.User.GuardianConsentStatus`. Two of the four lock
 * the account (see BLOCKING_GUARDIAN_STATUSES): `pending` has never been
 * approved, `withdrawn` was approved and had it taken away. They are kept apart
 * because they are not the same message to a child.
 */
export type GuardianConsentStatus =
  | "not_needed"
  | "pending"
  | "approved"
  | "withdrawn"

/**
 * The statuses the server refuses requests on.
 *
 * The client does not enforce anything with this — `guardians/permissions.py`
 * does, on every request — it only decides which screen to show.
 */
export const BLOCKING_GUARDIAN_STATUSES: readonly GuardianConsentStatus[] = [
  "pending",
  "withdrawn",
]

/**
 * Where the standing request stands, for the waiting screen.
 *
 * `waiting` — the newest link is still live. `expired` — it lapsed with no
 * answer. `declined` — the child's newest event is the parent saying no. Only
 * ever set while `pending` with a parent named; `null` everywhere else.
 */
export type GuardianRequestState = "waiting" | "expired" | "declined"

/**
 * The `guardian` block on GET /user/details.
 *
 * Rides along on the call the client already makes at session start, which is
 * what lets a locked child's screen render on the same round trip that says the
 * account is locked — and it is what the waiting screen re-reads when the tab
 * comes back into view. `masked_contact` is non-null only while `pending` AND a
 * parent has actually been named — a minor who has just verified their OTP and
 * not yet reached the parent form gets `pending` with null, `false` and null.
 *
 * `same_as_login_contact` and `request_state` are optional on the type because
 * the backend may deploy before this client does; the store defaults them.
 */
export type GuardianStatusBlock = {
  status: GuardianConsentStatus
  /** e.g. "pri•••@gmail.com". Never the full address. */
  masked_contact: string | null
  /** The parent's address is the one the child signed up with. */
  same_as_login_contact?: boolean
  request_state?: GuardianRequestState | null
}

/**
 * How the parent gets reached. Decided by the server, never the client.
 *
 * ONE VALUE. Every request goes out as an emailed link now — the child's own
 * sign-up address included — so this only ever says `link_sent`. It stays a
 * named type and stays on the wire because the store uses it as "a parent has
 * been named, go to the waiting screen", which is a different fact from
 * `required`.
 *
 * Comes back from POST /guardian/details ONLY. It is deliberately absent from
 * the auth responses — at OTP time nobody has named a parent yet, so there is
 * no mode to report.
 */
export type GuardianMode = "link_sent"

/** POST /guardian/details — body. */
export type GuardianDetailsPayload = {
  parent_name: string
  /**
   * Exactly ONE of these two, never both — the server 400s on both and on
   * neither.
   *
   * `parent_phone` is accepted by the type and refused by the server with
   * `code: "phone_not_supported"`: there is no SMS sender, and it refuses
   * before writing rather than leaving a child pending against a parent who
   * will never hear about it. That is why ENABLED_CONTACT_CHANNELS offers only
   * email — the field is built for the day the sender exists.
   */
  parent_email?: string
  parent_phone?: string
}

/** POST /guardian/details and POST /guardian/resend — response. */
export type GuardianDetailsResponse = {
  mode: GuardianMode
  /** The address the link went to, masked. Shown on the waiting screen. */
  masked_contact: string | null
  /**
   * The address is the one the child signed up with. The waiting screen says
   * so, rather than implying a second inbox exists. Optional for the same
   * deploy-order reason as on GuardianStatusBlock.
   */
  same_as_login_contact?: boolean
}

/** Which channel the parent's contact was given on. */
export type GuardianContactChannel = "email" | "phone"

/**
 * The channels this build offers, in the order they appear.
 *
 * ONE ENTRY, and it matches the server: `/guardian/details` refuses a phone
 * outright today. Adding "phone" here is a one-line change on this side, but it
 * is NOT the whole change — the backend needs an SMS sender first, or the field
 * would collect a number the server immediately rejects.
 */
export const ENABLED_CONTACT_CHANNELS: readonly GuardianContactChannel[] = [
  "email",
]

/**
 * The approval body — POST /guardian/consent/<token>/approve.
 *
 * `confirm_18_plus` is always literally true — the server checks `is not True`,
 * so a missing key, "", "false" and 0 are all refused. Nothing else: the
 * server no longer reads a date of birth, and the form no longer asks.
 */
export type GuardianApprovalPayload = {
  parent_name: string
  confirm_18_plus: true
}

/**
 * What the parent's page can be in.
 *
 * `pending` and `approved` are the server's — they are the only two states
 * `consent_page()` will render, and everything else (expired, superseded,
 * declined, already withdrawn, never existed) comes back as ONE generic 404
 * that says nothing about any child.
 *
 * `expired` and `invalid` are therefore CLIENT-SIDE labels, synthesized from
 * that refusal so the page has something to switch on. They render the same
 * screen, which is the point — see PublicConsentPage.
 */
export type GuardianConsentState =
  | "pending"
  | "approved"
  | "expired"
  | "invalid"

/**
 * GET /guardian/consent/<token>.
 *
 * The optional fields are absent on `expired`/`invalid`, because those are
 * synthesized from a 404 whose body carries nothing. That is the server's
 * security boundary, not a client convenience: a link that is forwarded,
 * guessed, or found in a browser history months later must not be a way to
 * learn that a particular young person has an account.
 */
export type GuardianConsentView = {
  state: GuardianConsentState
  child_username?: string
  /** The plain list of what we hold. Server-owned, so it matches the notice. */
  processed_data?: string[]
  notice_version?: string
  /** Other children of this guardian already approved. Handles, not names. */
  siblings?: string[]
  /** ISO timestamp. Only while a link is live. */
  expires_at?: string | null
  /**
   * The name the child gave for this parent — pre-fills the approval form.
   * Sent on `pending` only; the approved page has no form and gets null.
   */
  guardian_name?: string | null
}
