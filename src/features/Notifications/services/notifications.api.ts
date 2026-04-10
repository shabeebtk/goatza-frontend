import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type NotificationActor = {
  id: string
  name: string
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