import api from "@/core/api/axios"

// ── Types (co-located, mirror the backend dashboard payload) ──
export type DashboardRange = 7 | 30 | 90

export type DashboardStats = {
  active_recruitments: number
  total_applications: number
  new_applications_in_range: number
  followers_count: number
  new_followers_in_range: number
  total_recruitment_views: number
}

/**
 * {status: count}, zero-filled by the server for every status it still
 * has choices for.
 *
 * INDEXED, not a fixed shape. The retired `invited` / `rejected` keys
 * appear only for an org whose rows the backfill has not reached, and
 * naming them as required fields would render `undefined` for everybody
 * else. Every read goes through a `?? 0`.
 */
export type PipelineCounts = Record<string, number | undefined> & {
  applied?: number
  reviewing?: number
  shortlisted?: number
  trial_confirmed?: number
  not_shortlisted?: number
  selected?: number
  not_selected?: number
  withdrawn?: number
}

export type DeadlineSoon = {
  id: string
  title: string
  application_deadline: string
}

export type DraftItem = {
  id: string
  title: string
}

export type NearCapacityItem = {
  id: string
  title: string
  applications_count: number
  max_applications: number
}

export type NeedsAttention = {
  unreviewed_applications: number
  deadlines_soon: DeadlineSoon[]
  drafts: DraftItem[]
  near_capacity: NearCapacityItem[]
}

export type RecruitmentRow = {
  id: string
  title: string
  recruitment_type: string
  status: string
  views_count: number
  applications_count: number
  confirmed_count: number
  selected_count: number
  conversion: number
  application_deadline: string | null
  event_date: string | null
}

export type TrendPoint = {
  date: string
  count: number
}

export type AgeCategoryLite = {
  title: string
  reporting_time: string | null
}

export type UpcomingEvent = {
  id: string
  title: string
  event_date: string
  venue_name: string
  city: string
  age_categories: AgeCategoryLite[]
}

export type TopPost = {
  id: string
  text: string
  thumbnail: string | null
  likes_count: number
  comments_count: number
  created_at: string
}

export type DashboardData = {
  range: number
  stats: DashboardStats
  pipeline: PipelineCounts
  needs_attention: NeedsAttention
  recruitments_table: RecruitmentRow[]
  trends: {
    applications_per_day: TrendPoint[]
    followers_per_day: TrendPoint[]
  }
  upcoming_events: UpcomingEvent[]
  top_posts: TopPost[]
}

// ── API calls ──
export const getDashboardApi = async (
  range: DashboardRange
): Promise<DashboardData> => {
  const res = await api.get("/organizations/dashboard", {
    params: { range },
  })
  return res.data.data
}
