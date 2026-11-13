import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type ActorKind = "user" | "organization"

export type NotificationActor = {
  id: string
  name: string
  username: string
  avatar: string
  /** Which of the two profile route spaces this actor belongs to. */
  type: ActorKind
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
  /**
   * Someone shared a post / recruitment / profile into a chat. In-app rows only
   * ever come from a share; the push payload also uses this type for ordinary
   * chat messages, which write no row.
   */
  | "message"
  | "recruitment_application"
  | "recruitment_application_status"
  /**
   * Player-side: the club deleted a recruitment they were still waiting on.
   * `data.note` is the club's reason; the URL is the Applied tab, never the
   * deleted posting.
   */
  | "recruitment_removed"
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
  /**
   * Author-side: a post or highlight the server was holding while its media
   * converted could not be published. Platform-voiced — NO actor. The text
   * is already "Your post couldn't be published" / "Your highlight couldn't
   * be added" (by `data.target`); `data.error_message` says why. A success
   * sends nothing: it only moves the upload along (publication_updated).
   */
  | "publication_failed"
  /** Invitee-side: an org wants them. The card answers in place, with Accept / Decline. */
  | "org_invite"
  /** Manager-side: someone joined. */
  | "org_invite_accepted"
  /** Inviter-side: someone said no. In-app only. */
  | "org_invite_declined"
  /** Member-side: they were removed. In-app only, and opens /home. */
  | "org_member_removed"
  /** Member-side: their role changed. */
  | "org_role_changed"
  /** Owner-side: another owner was removed or demoted. The safeguard. */
  | "org_owner_changed"
  /** Club-side: someone asked to join a squad through its link. */
  | "squad_join_request"
  /** Player-side: a club invited them. The card answers in place, like org_invite. */
  | "squad_invite"
  /** Player-side: the club approved their request (or verified them into a squad). */
  | "squad_request_approved"
  /** Player-side: the club said no. */
  | "squad_request_declined"
  /** Club-side: a player accepted the club's invite. */
  | "squad_invite_accepted"
  /** Player-side: the club took them out of a squad. */
  | "squad_member_removed"
  /** Player-side: the club moved them to another squad. */
  | "squad_member_moved"

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
  /** recruitment_removed: the club's note to applicants. */
  note?: string
  /** publication_failed: what was held, and the server's sentence for why. */
  publication_id?: string
  target?: "post" | "highlight"
  error_code?: string
  error_message?: string
  /** org_invite: what Accept and Decline answer. */
  invite_id?: string
  /** The organization* types: the org they are about. */
  organization?: { id: string; name: string; username: string; logo: string }
  /** The squad_* types: the squad they are about. */
  squad?: { id: string; name: string }
  /** squad_invite: what Accept and Decline answer, and what the club offered. */
  member_id?: string
  position_name?: string
  jersey_number?: number | null
  inviter_name?: string
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
  /**
   * Where this notification opens. The backend is the single source of truth
   * for it — resolved against the RECIPIENT's route space, so an org-recipient
   * row stays under /organization/admin/<id>/… and never flips the active
   * actor. The client navigates to it verbatim and derives nothing from `type`.
   */
  url: string
  actor_type: ActorKind
  recipient_type: ActorKind
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