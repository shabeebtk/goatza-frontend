import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type NotificationActor = {
  id: string
  name: string
  username: string
  avatar: string
}

export type NotificationPost = {
  id: string
  content: string
  media: {
    type: string,
    url: string,
    thumbnail: string
  }
  author: {
    id: string
    username: string
    name: string
    profile_photo: string
    headline: string
  }
}

export type NotificationComment = {
  id: string
  text: string
}

export type NotificationType =
  | "follow"
  | "follow_back"
  | "like"
  | "comment"
  | "mention"
  | "connection"
  | "recruitment_application"
  | "recruitment_application_status"
  /** Org-side: a player listed this org on their career and wants it verified. */
  | "career_verification_request"
  /** Player-side: the org confirmed / declined a career entry. */
  | "career_verified"
  | "career_rejected"
  /** Player-side: selected for a recruitment — offer to add it to their career. */
  | "career_add_prompt"
  /** Org-side: someone credited this org with issuing an award, and wants it verified. */
  | "achievement_verification_request"
  /** Owner-side: the org confirmed / declined an achievement. */
  | "achievement_verified"
  | "achievement_rejected"

export type NotificationRecruitment = {
  id: string
  title: string
  status: string
}

export type NotificationCareerEntry = {
  id: string
  title: string
  organization_name: string
  verification_status: string
}

/**
 * The primary row's raw payload, passed through by the grouping service.
 *
 * Only a few types put anything here that the client acts on — most notably
 * `career_add_prompt`, whose `application_id` is the ONLY place the id needed
 * by /careers/from-application/<id> appears in this response.
 */
export type NotificationData = {
  application_id?: string
  recruitment_id?: string
  recruitment_title?: string
  career_entry_id?: string
  entry_title?: string
  /**
   * The achievement types carry their id and title HERE and nowhere else — the
   * grouping service attaches no nested `achievement` object the way it does
   * for `career_entry`, so this is the only handle the client gets.
   */
  achievement_id?: string
  achievement_title?: string
  organization_name?: string
  owner_username?: string
  reason?: string
  [key: string]: unknown
}

export type Notification = {
  id: string
  type: NotificationType
  text: string
  actors: NotificationActor[]
  others_count: number
  is_read: boolean
  created_at: string
  post: NotificationPost | null
  comment: NotificationComment | null
  recruitment?: NotificationRecruitment | null
  career_entry?: NotificationCareerEntry | null
  data?: NotificationData
}

export type NotificationsResponse = {
  next_cursor: string | null
  results: Notification[]
}

export type UnreadCountResponse = {
  count: number
}

// ── API calls ────────────────────────────────────────────────

export const getNotificationsApi = async (
  cursor?: string | null
): Promise<NotificationsResponse> => {
  const res = await api.get("/notifications/list", {
    params: cursor ? { cursor } : undefined,
  })
  return res.data.data
}

export const getUnreadCountApi = async (): Promise<UnreadCountResponse> => {
  const res = await api.get("/notifications/unread/count")
  return res.data.data
}

export const markNotificationReadApi = async (
  notificationId: string
): Promise<void> => {
  await api.post("/notifications/mark/read", null, {
    params: { notification_id: notificationId },
  })
}

export const markAllNotificationsReadApi = async (): Promise<void> => {
  await api.post("/notifications/mark/read/all")
}