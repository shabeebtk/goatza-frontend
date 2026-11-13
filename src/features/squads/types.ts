/**
 * Squads, as the backend sends them (apps/squads/serializers). A squad is one of
 * a club's standing groups ("U17 Boys", "Senior Men"), one sport each, and only
 * player accounts can be in one.
 */

export type SportBrief = {
  id: string
  name: string
  icon_name: string
}

/** How the squad's sport talks about its people and positions. */
export type SquadConfig = {
  uses_positions: boolean
  uses_jersey_numbers: boolean
  member_noun: string
  member_noun_plural: string
  /** Position groups in display order ("Goalkeepers", "Defenders", ...). */
  group_order: string[]
  typical_squad_size: number | null
  positions: { id: string; name: string; group: string }[]
}

export type SquadLevel = "youth" | "reserve" | "senior" | ""

export type SquadListItem = {
  id: string
  name: string
  sport: SportBrief
  level: SquadLevel
  level_label: string
  age_group: string
  season: string
  photo_url: string
  is_public: boolean
  invite_enabled: boolean
  members_count: number
  pending_count: number
  open_invites_count: number
  created_at: string
}

export type PersonMini = {
  id: string
  username: string
  name: string
  photo: string
}

/** A person as the club sees them: their age comes too. */
export type ClubPerson = PersonMini & { age: number | null }

export type PositionMini = { id: string; name: string }
export type PositionWithGroup = PositionMini & { group: string }

export type StaffRole = "head_coach" | "assistant_coach" | "manager" | "physio" | "other"

export type StaffItem = {
  id: string
  /** The OrganizationMember id, which is what adding a staff member takes. */
  member_id: string
  role: StaffRole
  role_label: string
  title: string
  user: PersonMini
}

export type SquadInviteLink = { url: string; enabled: boolean }

export type SquadDetail = SquadListItem & {
  description: string
  config: SquadConfig
  staff: StaffItem[]
  captain_member_id: string | null
  /** Null unless the viewer has squads.review. */
  invite: SquadInviteLink | null
}

export type MemberSource = "link" | "invite" | "recruitment" | "verification"

export type MemberItem = {
  id: string
  status: string
  source: MemberSource
  user: ClubPerson
  /** The player's own primary position from their profile. */
  primary_position: PositionMini | null
  /** The position the club put them in, for this squad. */
  position: PositionWithGroup | null
  jersey_number: number | null
  is_captain: boolean
  joined_at: string | null
  career_entry_id: string | null
  /** Only for squads.review. */
  notes?: string
}

export type RosterGroup = { name: string; count: number; members: MemberItem[] }

/** Groups arrive in display order; the last is "Other". */
export type Roster = { count: number; groups: RosterGroup[] }

export type RequestItem = {
  id: string
  source: MemberSource
  requested_at: string
  user: ClubPerson
  primary_position: PositionMini | null
}

export type InviteItem = {
  id: string
  source: MemberSource
  requested_at: string
  expires_at: string
  user: PersonMini
  position: PositionMini | null
  jersey_number: number | null
  invited_by_name: string
  recruitment: { id: string; title: string } | null
}

export type SquadRequests = { requests: RequestItem[]; invites: InviteItem[] }

export type CandidateState = "none" | "active" | "pending" | "invited"

export type Candidate = {
  user: PersonMini
  primary_position: PositionMini | null
  state: CandidateState
}

// ── Payloads ──────────────────────────────────────────────────

export type CreateSquadPayload = {
  name: string
  sport_id: string
  level?: SquadLevel
  age_group?: string
  season?: string
  description?: string
  is_public?: boolean
}

export type UpdateSquadPayload = Partial<CreateSquadPayload>

export type SquadPhotoPayload =
  | { photo_url: string; photo_public_id: string }
  | { remove: true }

export type AddStaffPayload = { member_id: string; role: StaffRole; title?: string }

export type UpdateMemberPayload = {
  position_id?: string | null
  jersey_number?: number | null
  is_captain?: boolean
  notes?: string
}

export type RemoveReason = "left" | "mistake"

export type ApproveItem = {
  member_id: string
  position_id?: string
  jersey_number?: number
  is_captain?: boolean
}

export type BatchFailure = { member_id: string; code: string; message: string }

export type ApproveResult = { approved: MemberItem[]; failed: BatchFailure[] }
export type DeclineResult = { declined: string[]; failed: BatchFailure[] }

export type InvitePayload = {
  user_id: string
  position_id?: string
  jersey_number?: number
  application_id?: string
}

/** The tabs on a squad's page; each is its own route. */
export type SquadTab = "players" | "requests" | "settings"

// ── The player's side ─────────────────────────────────────────

/** Who is looking at the invite page, as the server sees them. Null when anonymous. */
export type SquadInviteMe = {
  state: "none" | "pending" | "invited" | "active"
  member_id: string | null
  can_join: boolean
  reason: null | "not_a_player" | "switch_to_personal"
}

/** GET /squads/invite/<token>. Never lists players. */
export type SquadInviteView = {
  squad: {
    id: string
    name: string
    sport: SportBrief
    level: SquadLevel
    level_label: string
    age_group: string
    season: string
    photo_url: string
    members_count: number
  }
  organization: {
    id: string
    name: string
    username: string
    logo: string
    type: string
    is_verified: boolean
  }
  head_coach: { name: string } | null
  me: SquadInviteMe | null
}

export type SquadJoinResult = { state: "pending" | "active"; member_id: string }

export type MySquadStatus = "active" | "invited" | "pending"

/** One row of GET /squads/mine. */
export type MySquadItem = {
  id: string
  status: MySquadStatus
  source: MemberSource
  squad: {
    id: string
    name: string
    sport: SportBrief
    photo_url: string
    level_label: string
    age_group: string
  }
  organization: { id: string; name: string; username: string; logo: string; is_verified: boolean }
  position: PositionMini | null
  jersey_number: number | null
  is_captain: boolean
  requested_at: string | null
  expires_at: string | null
  joined_at: string | null
}

// ── The showcase: what everyone else sees ─────────────────────

export type ShowcaseOrganization = {
  id: string
  name: string
  username: string
  logo: string
  is_verified: boolean
  type: string
}

/** A face on a squad card. `photo` is "" for a minor on the anonymous route. */
export type ShowcasePreviewMember = { name: string; photo: string }

export type ShowcaseSquadCard = {
  id: string
  name: string
  sport: SportBrief
  level_label: string
  age_group: string
  season: string
  photo_url: string
  members_count: number
  head_coach_name: string | null
  preview_members: ShowcasePreviewMember[]
}

/** GET /squads/showcase/<org> · /public/organization/<org>/squads */
export type ShowcaseList = {
  organization: ShowcaseOrganization
  squads: ShowcaseSquadCard[]
}

export type ShowcaseMember = {
  id: string
  name: string
  username: string
  photo: string
  position: PositionMini | null
  jersey_number: number | null
  is_captain: boolean
}

export type ShowcaseGroup = {
  name: string
  count: number
  /** Players counted here but not listed: private profiles, for an anonymous viewer. */
  hidden_count: number
  members: ShowcaseMember[]
}

export type ShowcaseStaff = { name: string; username: string; photo: string; role_label: string }

/** GET /squads/showcase/<org>/<id> · /public/organization/<org>/squads/<id> */
export type ShowcaseSquadPage = {
  organization: ShowcaseOrganization
  squad: {
    id: string
    name: string
    sport: SportBrief
    level: SquadLevel
    level_label: string
    age_group: string
    season: string
    description: string
    photo_url: string
  }
  config: Pick<
    SquadConfig,
    "uses_positions" | "uses_jersey_numbers" | "member_noun" | "member_noun_plural"
  >
  staff: ShowcaseStaff[]
  counts: { players: number; staff: number }
  captain_member_id: string | null
  groups: ShowcaseGroup[]
  other_squads: { id: string; name: string; sport: SportBrief; members_count: number }[]
}
