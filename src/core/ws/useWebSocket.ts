/**
 * useWebSocket — Generic reusable WS hook
 *
 * Built on wsManager (singleton per URL). Handles:
 * - Auto-connect on mount, auto-release on unmount
 * - Exponential backoff reconnect (jitter included)
 * - Connection status tracking
 * - Message handler registration
 *
 * Example usage:
 *
 *   // Chat
 *   const { send, status } = useWebSocket({
 *     url: `ws://localhost/ws/chat/${conversationId}/`,
 *     onMessage: (data) => console.log(data),
 *   })
 *
 *   // Notifications (just pass a different URL)
 *   const { status } = useWebSocket({
 *     url: `ws://localhost/ws/notifications/`,
 *     onMessage: handleNotification,
 *   })
 */

import { useEffect, useRef, useCallback, useState } from "react"
import { wsManager } from "./wsManager"
import { useAuthStore } from "@/store/auth.store"

export type WsStatus = "connecting" | "open" | "closing" | "closed"

export interface UseWebSocketOptions {
    /** Full WebSocket URL */
    url: string | null
    /**
     * access token — accepted for API compatibility, but ignored: the socket
     * always presents the live store token so reconnects can't send a stale one.
     */
    token?: string | null
    /** Called on every incoming message (already JSON-parsed if possible) */
    onMessage?: (data: unknown) => void
    /** Called on connection open */
    onOpen?: () => void
    /** Called on connection close */
    onClose?: (event: CloseEvent) => void
    /** Called on error */
    onError?: (event: Event) => void
    /** Disable auto-reconnect (default: true) */
    reconnect?: boolean
    /** Initial reconnect delay ms (default: 1000) */
    reconnectDelay?: number
    /** Max reconnect delay ms (default: 30000) */
    maxReconnectDelay?: number
    /** Max reconnect attempts (default: 8) */
    maxAttempts?: number
}

export interface UseWebSocketReturn {
    /** Send a JSON-serialisable message */
    send: (data: Record<string, unknown>) => void
    /** Current connection status */
    status: WsStatus
    /** Manually disconnect (won't reconnect) */
    disconnect: () => void
}

const WS_READY_STATE_MAP: Record<number, WsStatus> = {
    0: "connecting",
    1: "open",
    2: "closing",
    3: "closed",
}

export function useWebSocket({
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30_000,
    maxAttempts = 8,
}: UseWebSocketOptions): UseWebSocketReturn {
    const [status, setStatus] = useState<WsStatus>("closed")
    const socketRef = useRef<WebSocket | null>(null)
    const attemptsRef = useRef(0)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const intentionalCloseRef = useRef(false)
    /**
     * The LIVE connection's listener cleanup. A reconnect replaces it and the
     * effect cleanup calls whichever is current — not only the first one's,
     * which left a reconnected socket emitting after an account switch.
     */
    const detachRef = useRef<(() => void) | null>(null)
    /**
     * Bumped on every mount / url change and on cleanup. A socket's close and
     * a pending reconnect act only while their generation is still current,
     * so the old url's socket can never schedule a reconnect.
     */
    const generationRef = useRef(0)
    /** The url this hook holds a wsManager reference to — released once only. */
    const heldUrlRef = useRef<string | null>(null)

    // Stable refs for callbacks — avoids stale closure issues
    const onMessageRef = useRef(onMessage)
    const onOpenRef = useRef(onOpen)
    const onCloseRef = useRef(onClose)
    const onErrorRef = useRef(onError)
    useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
    useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
    useEffect(() => { onCloseRef.current = onClose }, [onClose])
    useEffect(() => { onErrorRef.current = onError }, [onError])

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }
    }, [])

    /** Always the latest `connect`. See the reconnect timer above. */
    const connectRef = useRef<(() => (() => void) | undefined) | null>(null)

    const connect = useCallback(() => {
        if (!url) return

        // Read the token at call time, not from the closure: `connect` is
        // reused for automatic reconnects (deliberately not in the deps), so a
        // captured `token` would be stale after a rotation. The proactive
        // refresh in refreshManager keeps the store value fresh.
        const liveToken = useAuthStore.getState().accessToken
        const protocols = liveToken ? ["access_token", liveToken] : undefined
        const socket = wsManager.get(url, protocols)
        heldUrlRef.current = url
        socketRef.current = socket
        const generation = generationRef.current
        setStatus(WS_READY_STATE_MAP[socket.readyState] ?? "connecting")

        const handleOpen = () => {
            attemptsRef.current = 0
            setStatus("open")
            onOpenRef.current?.()
        }

        const handleMessage = (event: MessageEvent) => {
            let parsed: unknown = event.data
            try { parsed = JSON.parse(event.data) } catch { /* raw string */ }
            onMessageRef.current?.(parsed)
        }

        const handleClose = (event: CloseEvent) => {
            // A socket from a previous url (or an unmounted hook): not ours.
            if (generation !== generationRef.current) return
            setStatus("closed")
            if (heldUrlRef.current === url) {
                wsManager.release(url)
                heldUrlRef.current = null
            }
            onCloseRef.current?.(event)

            if (
                !intentionalCloseRef.current &&
                reconnect &&
                attemptsRef.current < maxAttempts
            ) {
                const delay = Math.min(
                    reconnectDelay * 2 ** attemptsRef.current + Math.random() * 500,
                    maxReconnectDelay
                )
                attemptsRef.current++
                // Through a ref, not `connect` directly: `connect` is a
                // useCallback that would otherwise reference itself before it
                // is declared. The ref always holds the latest one (see the
                // effect below), which is also what a reconnect wants — a
                // reconnect fired after `url` changed should use the NEW
                // connect, not the closure that scheduled it.
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectTimerRef.current = null
                    if (generation !== generationRef.current || intentionalCloseRef.current) return
                    // The dead socket's listeners go; the new connection's
                    // cleanup is the one the effect will call.
                    detachRef.current?.()
                    detachRef.current = connectRef.current?.() ?? null
                }, delay)
            }
        }

        const handleError = (event: Event) => {
            onErrorRef.current?.(event)
        }

        socket.addEventListener("open", handleOpen)
        socket.addEventListener("message", handleMessage)
        socket.addEventListener("close", handleClose)
        socket.addEventListener("error", handleError)

        // If already open (shared socket), fire open manually
        if (socket.readyState === WebSocket.OPEN) {
            handleOpen()
        }

        return () => {
            socket.removeEventListener("open", handleOpen)
            socket.removeEventListener("message", handleMessage)
            socket.removeEventListener("close", handleClose)
            socket.removeEventListener("error", handleError)
        }
    }, [url, reconnect, reconnectDelay, maxReconnectDelay, maxAttempts])

    /**
     * End this hook's connection, whatever closes its socket next: no
     * reconnect from it, nothing more from it reaches the caller, and its
     * wsManager reference released exactly once.
     */
    const endConnection = useCallback(() => {
        generationRef.current++
        intentionalCloseRef.current = true
        clearReconnectTimer()
        detachRef.current?.()
        detachRef.current = null
        if (heldUrlRef.current) {
            wsManager.release(heldUrlRef.current)
            heldUrlRef.current = null
        }
    }, [clearReconnectTimer])

    // Kept before the mount effect so the ref is populated by the time the
    // first connection can possibly close and ask to reconnect.
    useEffect(() => {
        connectRef.current = connect
    }, [connect])

    /*
      Mount / url-change.

      KNOWN, AND DELIBERATELY SUPPRESSED. `connect()` reads the socket's
      readyState and writes it into `status` synchronously, which React Compiler
      flags as a cascading render — correctly. `status` is external state (the
      socket's), and the shape that expresses that properly is
      useSyncExternalStore over the socket rather than useState plus an effect.

      That is a real change to this hook, not a tidy-up: the subscribe/snapshot
      pair has to sit on top of wsManager's shared-socket reuse, the backoff
      reconnect and the token rotation, all of which this file currently owns
      and none of which has a test. It powers chat and conversations. It is
      worth doing on its own, with tests, rather than as a lint cleanup.

      The diagnostic is about render cost, not correctness — one extra render
      per socket open.
    */
    useEffect(() => {
        if (!url) return
        generationRef.current++
        intentionalCloseRef.current = false
        attemptsRef.current = 0
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
        detachRef.current = connect() ?? null
        return endConnection
    }, [url]) // eslint-disable-line

    const send = useCallback((data: Record<string, unknown>) => {
        const socket = socketRef.current
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data))
        } else {
            console.warn("[useWebSocket] Tried to send but socket not open")
        }
    }, [])

    const disconnect = useCallback(() => {
        intentionalCloseRef.current = true
        clearReconnectTimer()
        if (url) wsManager.forceClose(url)
        heldUrlRef.current = null
        setStatus("closed")
    }, [url, clearReconnectTimer])

    return { send, status, disconnect }
}