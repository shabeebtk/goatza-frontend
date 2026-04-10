"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./Toast.module.css"

// ── Types ────────────────────────────────────────────────────────────

export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type ToastVariant = "default" | "success" | "error" | "warning" | "info"

export interface ToastOptions {
  /** Notification title (bold) */
  title: string
  /** Optional subtitle / body text */
  message?: string
  /** Avatar URL — shows avatar chip like Instagram */
  avatarSrc?: string
  /** Avatar initials fallback */
  avatarInitials?: string
  /** Icon to show instead of avatar (mdi icon string) */
  icon?: string
  /** Visual variant — controls accent color */
  variant?: ToastVariant
  /** Duration in ms before auto-dismiss. 0 = persist */
  duration?: number
  /** Where on screen to show */
  position?: ToastPosition
  /** Optional CTA action */
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastItem extends ToastOptions {
  id: string
  /** Track whether currently being removed (for exit animation) */
  removing: boolean
}

// ── Context ──────────────────────────────────────────────────────────

interface ToastContextValue {
  show: (options: ToastOptions) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>")
  return ctx
}

// ── Default config ───────────────────────────────────────────────────

const DEFAULT_DURATION = 3000
const DEFAULT_POSITION: ToastPosition = "top-right"
const EXIT_DURATION = 350 // must match CSS animation duration

// ── Variant icon map ──────────────────────────────────────────────────

const VARIANT_ICON: Record<ToastVariant, string> = {
  default: "mdi:bell",
  success: "mdi:check-circle",
  error:   "mdi:alert-circle",
  warning: "mdi:alert",
  info:    "mdi:information",
}

// ── Single Toast item ─────────────────────────────────────────────────

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: (id: string) => void
}) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  const duration = toast.duration ?? DEFAULT_DURATION
  const hasAvatar = !!(toast.avatarSrc || toast.avatarInitials)
  const icon = toast.icon ?? (hasAvatar ? null : VARIANT_ICON[toast.variant ?? "default"])

  // Start auto-dismiss timer + progress bar animation
  useEffect(() => {
    if (duration === 0) return
    timerRef.current = setTimeout(() => onDismiss(toast.id), duration)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [duration, toast.id, onDismiss])

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (progressRef.current) progressRef.current.style.animationPlayState = "paused"
  }

  const handleMouseLeave = () => {
    if (duration === 0) return
    // Restart the remaining time (approximate — restart timer)
    timerRef.current = setTimeout(() => onDismiss(toast.id), duration)
    if (progressRef.current) progressRef.current.style.animationPlayState = "running"
  }

  return (
    <div
      className={`${styles.card} ${styles[`variant-${toast.variant ?? "default"}`]} ${toast.removing ? styles.cardRemoving : styles.cardEntering}`}
      role="alert"
      aria-live="assertive"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Progress bar */}
      {/* {duration > 0 && (
        <span
          ref={progressRef}
          className={styles.progress}
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
        />
      )} */}

      {/* Left: avatar or icon */}
      <div className={styles.cardLeft}>
        {hasAvatar ? (
          <Avatar
            src={toast.avatarSrc}
            initials={toast.avatarInitials ?? "?"}
            size="sm"
          />
        ) : icon ? (
          <span className={styles.iconWrap} aria-hidden="true">
            <Icon icon={icon} width={20} height={20} />
          </span>
        ) : null}
      </div>

      {/* Center: text */}
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{toast.title}</p>
        {toast.message && (
          <p className={styles.cardMessage}>{toast.message}</p>
        )}
        {toast.action && (
          <button
            className={styles.cardAction}
            onClick={() => {
              toast.action!.onClick()
              onDismiss(toast.id)
            }}
            type="button"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        className={styles.closeBtn}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        type="button"
      >
        <Icon icon="mdi:close" width={14} height={14} />
      </button>
    </div>
  )
}

// ── Toast region (per-position container) ────────────────────────────

function ToastRegion({
  position,
  toasts,
  onDismiss,
}: {
  position: ToastPosition
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className={`${styles.region} ${styles[`region-${position}`]}`}
      aria-label={`Notifications ${position}`}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// ── Provider ──────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    // Mark as removing → triggers exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
    )
    // Remove from DOM after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, EXIT_DURATION)
  }, [])

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map((t) => ({ ...t, removing: true })))
    setTimeout(() => setToasts([]), EXIT_DURATION)
  }, [])

  const show = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { ...options, id, removing: false }])
    return id
  }, [])

  // Group toasts by position for separate portals
  const positions: ToastPosition[] = [
    "top-left", "top-center", "top-right",
    "bottom-left", "bottom-center", "bottom-right",
  ]

  return (
    <ToastContext.Provider value={{ show, dismiss, dismissAll }}>
      {children}

      {positions.map((pos) => (
        <ToastRegion
          key={pos}
          position={pos}
          toasts={toasts.filter(
            (t) => (t.position ?? DEFAULT_POSITION) === pos
          )}
          onDismiss={dismiss}
        />
      ))}
    </ToastContext.Provider>
  )
}