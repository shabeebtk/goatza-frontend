/**
 * realtimeBus — every message the app-wide notifications socket receives,
 * handed to whoever asked for its `notification_type`.
 *
 * There is ONE ws/notifications/ connection (NotificationsSocket, mounted by
 * AppShell and OrgShell). Before it, the only socket on that channel was
 * opened inside ConversationsList, so an event the server sent while the
 * author was on any other screen — a converted video, a held post going
 * live — reached nothing.
 *
 *     const off = realtimeBus.on("media_job_updated", (event) => …)
 *     off()
 *
 * Handlers run synchronously, in subscription order; one that throws is
 * logged and the rest still run.
 */

export type RealtimePayload = {
    type?: string
    notification_type?: string
    [key: string]: unknown
}

type Handler = (payload: RealtimePayload) => void

/**
 * Emitted by NotificationsSocket each time the socket (re)opens. Events sent
 * while it was down are gone, so a listener that waits on one (a media job, a
 * held post) checks over HTTP at once instead of waiting for its next poll.
 */
export const REALTIME_OPEN = "realtime.open"

const handlers = new Map<string, Set<Handler>>()

export const realtimeBus = {
    /** Subscribe to one `notification_type`. Returns the unsubscribe. */
    on<T extends RealtimePayload = RealtimePayload>(
        notificationType: string,
        handler: (payload: T) => void
    ): () => void {
        const set = handlers.get(notificationType) ?? new Set<Handler>()
        handlers.set(notificationType, set)
        const wrapped = handler as Handler
        set.add(wrapped)
        return () => {
            set.delete(wrapped)
            if (set.size === 0) handlers.delete(notificationType)
        }
    },

    /** Hand one parsed message to its subscribers. Unknown types are dropped. */
    emit(payload: RealtimePayload): void {
        const type = payload?.notification_type
        if (typeof type !== "string") return
        const set = handlers.get(type)
        if (!set) return
        for (const handler of [...set]) {
            try {
                handler(payload)
            } catch (err) {
                console.error(`[realtimeBus] "${type}" handler threw`, err)
            }
        }
    },
}
