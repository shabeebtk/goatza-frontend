/**
 * Enquiries: what a page's enquiry form brings in. The server's half is the
 * backend CLAUDE.md's "Organization pages & enquiries" section.
 */

/** GET / PATCH enquiries/alerts: does this person get enquiry emails for one org. */
export type EnquiryAlerts = {
  email: boolean
}

export type EnquiryStatus = "new" | "contacted" | "joined" | "not_interested"

export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = ["new", "contacted", "joined", "not_interested"]

export type BestTime = "" | "morning" | "afternoon" | "evening"

/** One row of the inbox. */
export type InboxItem = {
  id: string
  status: EnquiryStatus
  for_whom: "child" | "self"
  player_name: string
  player_age: number
  /** "" when they asked for themselves. */
  guardian_name: string
  /** E.164. */
  phone: string
  phone_is_whatsapp: boolean
  /** "" means a general enquiry. */
  program_name: string
  location_name: string
  best_time: BestTime
  /** The first 120 characters. */
  message: string
  created_at: string
}

/** GET enquiries/<id>, and what PATCH answers. */
export type EnquiryDetail = InboxItem & {
  email: string
  program_id: string | null
  location_id: string | null
  status_label: string
  best_time_label: string
  /** The whole message. */
  message: string
  notes: string
  notes_updated_by: string | null
  notes_updated_at: string | null
  status_changed_by: string | null
  status_changed_at: string | null
  closed_at: string | null
}

export type EnquiryCounts = Record<EnquiryStatus, number>

/** One page of the inbox: newest first, 20 a page. */
export type InboxPage = {
  items: InboxItem[]
  next_cursor: string | null
  /** Follow the program and branch filters, not the status. */
  counts: EnquiryCounts
}

export type InboxFilters = {
  status: EnquiryStatus
  program_id?: string
  location_id?: string
}

export type UpdateEnquiryBody = {
  status?: EnquiryStatus
  /** ≤ 2000. */
  notes?: string
}

// ── The form on the org's page (visitors) ─────────────────────

/** POST enquiries/submit/<org_username>: anyone, no account needed. */
export type EnquirySubmitBody = {
  for_whom: "child" | "self"
  /** 2–80. */
  player_name: string
  /** 3..80. */
  player_age: number
  /** 2–80 for a child; "" for self. */
  guardian_name: string
  /** As typed: the server normalizes it to E.164. */
  phone: string
  phone_is_whatsapp: boolean
  email: string
  program_id?: string
  location_id?: string
  best_time: BestTime
  /** ≤ 500. */
  message: string
  /** The honeypot: what the hidden field holds, "" from a person. */
  website: string
}

/** 201: what the sent screen says back. The full phone is never echoed. */
export type EnquirySent = {
  /** "" for a general enquiry. */
  program_name: string
  location_name: string
  /** "+91 98•••• 3210". */
  phone_masked: string
}

/** What a send came to, read the same way for both transports. */
export type EnquirySubmitOutcome =
  | { kind: "sent"; enquiry: EnquirySent }
  /** 400 on for_whom: an under-18 asking for themselves. */
  | { kind: "guardian_needed"; message: string }
  /** 400: this phone or network already sent a few today. */
  | { kind: "too_many"; message: string }
  /** 400: field errors, keyed by the server's field names. */
  | { kind: "invalid"; errors: Record<string, string>; message: string }
  /** 404: the form is off, the org is gone, or a block. One answer, never which. */
  | { kind: "closed" }
  /** 429: 30 an hour per network. */
  | { kind: "throttled"; retryAfter: number | null }
  /** No answer at all. */
  | { kind: "network" }
  /** Anything else (a 5xx, a refusal with only a message). */
  | { kind: "failed"; message: string }
