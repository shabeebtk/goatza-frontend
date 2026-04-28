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
  posts_count:     number
  locations:       OrgLocation[]
  sports:          OrgSport[]
  created_at:      string
}

// ── Payloads ──────────────────────────────────────────────────────

export type OrgLocationPayload = {
  id?:          string | null
  name:         string
  address:      string
  city:         string
  state:        string
  country_code: string
  latitude:     number | null
  longitude:    number | null
  is_primary?:  boolean
}

export type CreateOrganizationPayload = {
  name:         string
  type:         OrgType
  headline?:    string
  website?:     string
  logo?:        string
  description?: string
  level?:       OrgLevel
  location?:    OrgLocationPayload
  sport_ids?:   string[]
}