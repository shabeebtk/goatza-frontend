"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchMentionSuggestionsApi,
  type MentionSuggestResponse,
} from "@/features/posts/services/mentions.api"

const DEBOUNCE_MS = 250

/** One flat, keyboard-navigable list: users first, then organizations. */
export type MentionOption = {
  id: string
  username: string
  name: string
  avatar: string
  type: "user" | "organization"
}

type ActiveToken = {
  /** Index of the "@" in the textarea value. */
  start: number
  /** Index just past the token (where the caret sits). */
  end: number
  /** The handle typed so far, without the "@". */
  query: string
}

// Matches the handle the caret is sitting inside — same charset as the
// backend's MENTION_RE, anchored to the end of the text before the caret.
// A "@" must open the token at the start of the body or after whitespace, so
// an email address ("me@example") never triggers the dropdown.
const ACTIVE_TOKEN_RE = /(?:^|\s)@([A-Za-z0-9_.]*)$/

function readActiveToken(value: string, caret: number): ActiveToken | null {
  const before = value.slice(0, caret)
  const match = ACTIVE_TOKEN_RE.exec(before)
  if (!match) return null

  const query = match[1]
  // Need at least one character to suggest anything useful.
  if (query.length < 1) return null

  return { start: caret - query.length - 1, end: caret, query }
}

/**
 * Drives the @mention dropdown for a textarea.
 *
 * The caller owns the textarea and its value; this hook only watches where the
 * caret is, fetches suggestions for the handle being typed, and hands back the
 * replacement text when something is picked. That keeps it identical in the
 * create and edit modals, which manage `content` differently.
 */
export function useMentionAutocomplete({
  value,
  textareaRef,
  onChange,
  disabled = false,
}: {
  value: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  /** Called with the full new textarea value after a pick. */
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [token, setToken] = useState<ActiveToken | null>(null)
  const [options, setOptions] = useState<MentionOption[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  // Set when Escape closes the dropdown, so it stays shut until the caret
  // leaves this token rather than immediately reopening on the next keystroke.
  const dismissedRef = useRef<string | null>(null)

  const close = useCallback(() => {
    setToken(null)
    setOptions([])
    setActiveIndex(0)
  }, [])

  /** Re-read the caret position. Call from onChange / onKeyUp / onClick. */
  const syncCaret = useCallback(() => {
    if (disabled) return close()

    const textarea = textareaRef.current
    if (!textarea) return close()

    const next = readActiveToken(value, textarea.selectionStart ?? 0)
    if (!next) {
      dismissedRef.current = null
      return close()
    }

    // Still inside a token the user explicitly dismissed → stay closed.
    if (dismissedRef.current !== null && next.query.startsWith(dismissedRef.current)) {
      return
    }
    dismissedRef.current = null

    setToken(next)
  }, [close, disabled, textareaRef, value])

  // Debounced fetch. A failure or an empty result just closes the dropdown —
  // the composer must never surface a suggestion error.
  useEffect(() => {
    if (!token) return

    let cancelled = false
    const timer = setTimeout(() => {
      fetchMentionSuggestionsApi(token.query)
        .then((data: MentionSuggestResponse) => {
          if (cancelled) return
          const next: MentionOption[] = [
            ...data.users.map((user) => ({
              id: user.id,
              username: user.username,
              name: user.name,
              avatar: user.profile_photo,
              type: "user" as const,
            })),
            ...data.organizations.map((org) => ({
              id: org.id,
              username: org.username,
              name: org.name,
              avatar: org.logo,
              type: "organization" as const,
            })),
          ]
          setOptions(next)
          setActiveIndex(0)
        })
        .catch(() => {
          if (!cancelled) setOptions([])
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [token])

  const isOpen = !!token && options.length > 0

  /** Replace the active token with the picked handle + a trailing space. */
  const select = useCallback(
    (option: MentionOption) => {
      if (!token) return

      const inserted = `@${option.username} `
      const next = value.slice(0, token.start) + inserted + value.slice(token.end)
      onChange(next)
      close()

      // Put the caret after the inserted handle. Deferred to the next frame:
      // the value is controlled, so the DOM node still holds the old text
      // until React commits the change.
      const caret = token.start + inserted.length
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(caret, caret)
      })
    },
    [close, onChange, textareaRef, token, value]
  )

  /**
   * Wire to the textarea's onKeyDown. Returns true when the key was consumed
   * by the dropdown, so the caller can skip its own handling.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (event.key === "Escape" && token) {
        event.preventDefault()
        dismissedRef.current = token.query
        close()
        return true
      }

      if (!isOpen) return false

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % options.length)
        return true
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + options.length) % options.length)
        return true
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        select(options[activeIndex])
        return true
      }

      return false
    },
    [activeIndex, close, isOpen, options, select, token]
  )

  return useMemo(
    () => ({
      isOpen,
      options,
      activeIndex,
      query: token?.query ?? "",
      syncCaret,
      handleKeyDown,
      select,
      close,
      setActiveIndex,
    }),
    [activeIndex, close, handleKeyDown, isOpen, options, select, syncCaret, token]
  )
}
