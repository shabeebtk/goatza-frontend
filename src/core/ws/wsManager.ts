/**
 * wsManager — Singleton WebSocket connection manager
 *
 * Manages one WS connection per URL. Reuse across chat rooms,
 * notification channel, or any future WS endpoint.
 *
 * Usage:
 *   const socket = wsManager.get("ws://localhost/ws/chat/123/")
 *   socket.addEventListener("message", handler)
 *   wsManager.close("ws://localhost/ws/chat/123/")
 */

type SocketEntry = {
  socket: WebSocket
  refCount: number
}

class WsManager {
  private sockets = new Map<string, SocketEntry>()

  /**
   * Get or create a WebSocket for the given URL.
   * Reference-counted — each `get` increments, each `release` decrements.
   */
  get(url: string, protocols?: string[]): WebSocket {
    const entry = this.sockets.get(url)

    if (entry && entry.socket.readyState <= WebSocket.OPEN) {
      entry.refCount++
      return entry.socket
    }

    // Stale entry — remove before creating fresh
    if (entry) {
      this.sockets.delete(url)
    }

    const socket = new WebSocket(url, protocols)
    this.sockets.set(url, { socket, refCount: 1 })
    return socket
  }

  /**
   * Decrement refcount. Closes + removes socket when no consumers remain.
   */
  release(url: string): void {
    const entry = this.sockets.get(url)
    if (!entry) return

    entry.refCount--

    if (entry.refCount <= 0) {
      if (
        entry.socket.readyState === WebSocket.OPEN ||
        entry.socket.readyState === WebSocket.CONNECTING
      ) {
        entry.socket.close(1000, "No consumers remaining")
      }
      this.sockets.delete(url)
    }
  }

  /**
   * Force-close a socket regardless of refcount.
   * Use when navigating away from a conversation entirely.
   */
  forceClose(url: string): void {
    const entry = this.sockets.get(url)
    if (!entry) return
    entry.socket.close(1000, "Force closed")
    this.sockets.delete(url)
  }

  getStatus(url: string): number | null {
    return this.sockets.get(url)?.socket.readyState ?? null
  }
}

// Export singleton
export const wsManager = new WsManager()