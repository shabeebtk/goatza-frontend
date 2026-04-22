// ── Types ────────────────────────────────────────────────────
 
export type OrgType  = "club" | "team" | "academy" | "school"
export type OrgLevel = "youth" | "amateur" | "semi_professional" | "professional"
 

export type OrganizationMini = {
  id: string
  name: string
  username: string
  type: string
  logo: string
  headline: string
  is_verified: boolean
}

export type OrgLocationPayload = {
  name:         string
  address:      string
  city:         string
  state:        string
  country_code: string
  latitude:     number
  longitude:    number
}

 
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

 
export type CreateOrganizationPayload = {
  name:        string
  type:        OrgType
  headline?:   string
  website?:    string
  logo?:       string
  description?: string
  level?:      OrgLevel
  location?:   OrgLocationPayload
  sport_ids?:  string[]
}