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

export type WsStatus = "connecting" | "open" | "closing" | "closed"

export interface UseWebSocketOptions {
    /** Full WebSocket URL */
    url: string | null
    /** access token */
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
    token,
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

    const connect = useCallback(() => {
        if (!url) return

        const protocols = token ? ["access_token", token] : undefined
        const socket = wsManager.get(url, protocols)
        socketRef.current = socket
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
            setStatus("closed")
            wsManager.release(url)
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
                reconnectTimerRef.current = setTimeout(connect, delay)
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
    }, [url, reconnect, reconnectDelay, maxReconnectDelay, maxAttempts]) // eslint-disable-line

    // Mount / url-change
    useEffect(() => {
        if (!url) return
        intentionalCloseRef.current = false
        attemptsRef.current = 0
        const cleanup = connect()
        return () => {
            clearReconnectTimer()
            cleanup?.()
            if (url) wsManager.release(url)
        }
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
        setStatus("closed")
    }, [url, clearReconnectTimer])

    return { send, status, disconnect }
}