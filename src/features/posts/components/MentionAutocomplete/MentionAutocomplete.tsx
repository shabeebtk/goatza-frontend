"use client"

import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { MentionOption } from "./useMentionAutocomplete"
import styles from "./MentionAutocomplete.module.css"

/**
 * The @mention dropdown. Purely presentational — `useMentionAutocomplete`
 * owns the caret watching, fetching and keyboard state, so the create and
 * edit modals render this identically.
 *
 * Both composers render it in normal flow ABOVE the textarea. Below it, the
 * media preview pushes the list off the bottom of the scrolled modal body as
 * soon as a photo or video is attached — which is exactly where suggestions
 * are least likely to be seen. Above the input it sits between the author row
 * and the caret, always in view.
 *
 * In flow rather than absolutely positioned: the modals scroll their own body
 * and clip it, so an overlay opening upward would be cut off at the header on
 * a phone. Growing in flow can't be clipped and can't run off-screen.
 */
export default function MentionAutocomplete({
  open,
  options,
  activeIndex,
  onSelect,
  onHover,
}: {
  open: boolean
  options: MentionOption[]
  activeIndex: number
  onSelect: (option: MentionOption) => void
  onHover: (index: number) => void
}) {
  if (!open) return null

  return (
    <ul className={styles.list} role="listbox" aria-label="Mention suggestions">
      {options.map((option, index) => (
        <li key={`${option.type}:${option.id}`}>
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`${styles.row} ${index === activeIndex ? styles.rowActive : ""}`}
            // Pointer-down, not click: the textarea would lose focus on blur
            // before a click ever landed, closing the dropdown under the tap.
            onPointerDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
            onMouseEnter={() => onHover(index)}
          >
            <Avatar
              src={option.avatar || undefined}
              initials={option.name?.slice(0, 2).toUpperCase() || "?"}
              size="xs"
            />

            <span className={styles.text}>
              <span className={styles.name}>{option.name || option.username}</span>
              <span className={styles.handle}>@{option.username}</span>
            </span>

            {option.type === "organization" && (
              <span className={styles.badge}>
                <Icon icon="mdi:shield-account-outline" width={11} height={11} />
                Org
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
