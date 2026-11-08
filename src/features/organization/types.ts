// ── Primitives ────────────────────────────────────────────────────

export type OrgType  = "club" | "team" | "academy" | "school"
export type OrgLevel = "youth" | "amateur" | "semi_professional" | "professional"

// ── Mini (list / nav) ─────────────────────────────────────────────

export type OrganizationMini = {
  id:          string
  name:        string
  username:    string
  type:        string
  logo:        string
  headline:    string
  is_verified: boolean
  /** The signed-in member, on /organizations/list. A UI hint: the server re-checks. */
  my_role?:        OrgMemberRole | null
  my_permissions?: string[]
}

// ── Full (create / admin) ─────────────────────────────────────────

export type Organization = {
  id:          string
  name:        string
  type:        OrgType
  logo:        string | null
  headline:    string | null
  description: string | null
  level:       OrgLevel | null
  website:     string | null
  slug:        string
  my_permissions?: string[]
}

// ── Detail (profile page) ─────────────────────────────────────────

export type OrgLocation = {
  id:           string
  name:         string
  address:      string
  city:         string
  state:        string
  country_code: string
  latitude:     number | null
  longitude:    number | null
  is_primary:   boolean
}

export type OrgSport = {
  id:         string
  name:       string
  icon_name:  string
  icon_url:   string
  is_primary: boolean
}

export type OrgRelationship = {
  is_me: boolean
  is_following: boolean
  is_followed_by: boolean
  is_connected: boolean
  /** A block in EITHER direction — swaps Follow/Message for the blocked state. */
  is_blocked: boolean
  /** THIS viewer did the blocking — the only case that offers Unblock. */
  is_blocked_by_me: boolean
}

/** An org member's role, as `my_role` reports it. */
export type OrgMemberRole = "owner" | "coach" | "staff"

export type OrganizationDetail = {
  id:              string
  name:            string
  username:        string
  type:            OrgType
  is_verified:     boolean
  logo:            string
  cover_image:     string
  headline:        string
  description:     string
  website:         string
  level:           OrgLevel | ""
  followers_count: number
  following_count?: number
  posts_count:     number
  /** Visible to logged-out visitors. Does not affect in-app visibility. */
  is_public_profile?: boolean
  /**
   * The REQUESTING user's role in this org, or null if they aren't a member.
   * A label, never a gate: check my_permissions (hasOrgPermission).
   */
  my_role?:        OrgMemberRole | null
  /** What the requesting member may do. A UI hint: the server re-checks. */
  my_permissions?: string[]
  locations:       OrgLocation[]
  sports:          OrgSport[]
  created_at:      string
  relationship?:   OrgRelationship
  /** Top-level twin of relationship.is_blocked_by_me (see UserProfile). */
  is_blocked_by_me?: boolean
}

// ── Payloads ──────────────────────────────────────────────────────

/**
 * One org branch. TWO things share this payload: the org's own facts (`name` is
 * the BRANCH label — "Main Branch" — plus `address` and `is_primary`) and the
 * PLACE it sits at (everything from `provider` down).
 *
 * That split is why the place's own label arrives as `location_name` rather
 * than `name`: `name` was already taken by the branch, and sending the city
 * label in it would name the shared Location row "Main Branch". The backend
 * reads exactly this pair of names (see organization_location_service.py).
 */
export type OrgLocationPayload = {
  id?:          string | null
  name:         string
  address:      string
  city:         string
  state:        string
  country_code: string
  /** The place's own label, e.g. "Kannur, Kerala, India". */
  location_name?: string
  provider?:    "google"
  external_id?: string
  type?:        "city" | "place"
  country?:     string
  latitude:     number | null
  longitude:    number | null
  is_primary?:  boolean
}

export type CreateOrganizationPayload = {
  name:         string
  type:         OrgType
  /** The handle the person chose. Absent: the server generates one from the name. */
  username?:    string
  headline?:    string
  website?:     string
  logo?:        string
  description?: string
  level?:       OrgLevel
  location?:    OrgLocationPayload
  sport_ids?:   string[]
}

/** What POST /organizations/create answers with. */
export type CreatedOrganization = {
  id:       string
  name:     string
  username: string
  type:     OrgType
  headline: string
  logo:     string
}

/** GET /organizations/create/eligibility: may this person make another page? */
export type CreateEligibility = {
  allowed: boolean
  limit:   number
  used:    number
}

/**
 * Why a create was refused. The first four are the server's codes; "network"
 * covers no response at all and any 5xx, and "unknown" a 4xx without a code.
 */
export type CreateOrgErrorCode =
  | "username_taken"
  | "username_invalid"
  | "org_limit"
  | "invalid"
  | "network"
  | "unknown"
