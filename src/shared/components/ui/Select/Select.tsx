"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import clsx from "clsx"
import { Icon } from "@iconify/react"

import Portal from "../Portal/Portal"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useCloseOnScroll } from "@/shared/hooks/useCloseOnScroll"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import styles from "./Select.module.css"

/**
 * Select — the ONE select in the app. No native select element is left.
 *
 * WHY NOT THE NATIVE ELEMENT
 *
 * The closed field was never the problem; the open one was. A native popup is
 * drawn by the OS — a wheel picker on iOS, a full-screen list on Android, a
 * bare list on desktop — and `<option>` takes no styling at all. Worse, the
 * popup's colours come from `color-scheme`, which follows the OS, while the
 * app's theme is the user's own `data-theme` toggle: a user reading in dark
 * mode on a light phone opened a white list out of a dark form. Roughly forty
 * of these were also hand-styled under five different class names in feature
 * CSS, so they had drifted from each other as well.
 *
 * So the popup is ours: a listbox we draw, themed by the same tokens as
 * everything else.
 *
 * SHAPE
 *
 * It follows CountrySelect (trigger button, panel, prefix-first search, arrow
 * keys, aria wiring) and StatusChangeMenu's responsive split: an anchored
 * dropdown at ≥768px, a bottom sheet below it, where a list pinned to a
 * thumb beats a panel hanging off a 40px-tall field.
 *
 * WHY THE DESKTOP PANEL IS PORTALLED
 *
 * Every modal that hosts one of these — CreateRecruitmentModal, CreatePostModal,
 * ApplyRecruitmentModal, CareerEntryModal, AchievementModal, EditProfileModal,
 * EditOrgProfileModal, MatchEntrySheet — has `overflow` rules on its body, so
 * an absolutely-positioned panel is clipped by the modal it was opened from.
 * The panel goes through `Portal` and is placed with `position: fixed` off the
 * trigger's `getBoundingClientRect()` instead, at `--z-select-panel` (700) so
 * it sits above the host, the post editor included. Fixed placement is only
 * true until something scrolls, which is what `useCloseOnScroll` is for.
 *
 * `onChange` hands back a plain value, not a ChangeEvent: there is no native
 * element behind it, and faking one would be a lie that only worked until
 * somebody read `e.target`. react-hook-form call sites use `<Controller>`.
 */

type Size = "sm" | "md" | "lg"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Optional second line in the row — e.g. a helper or a code. */
  hint?: string
  /** Optional Iconify name rendered at the row's left. */
  icon?: string
}

export interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  label?: string
  /** Shown when `value` is "". */
  placeholder?: string
  helperText?: string
  error?: string
  size?: Size
  disabled?: boolean
  required?: boolean
  /** Renders a hidden input so an enclosing <form> still carries the value. */
  name?: string
  id?: string
  className?: string
  /** undefined = auto (search shows when options.length > 8) */
  searchable?: boolean
  /** Sheet/dropdown heading on mobile; defaults to `label`. */
  sheetTitle?: string
  /** So react-hook-form can mark the field touched. */
  onBlur?: () => void
  "aria-label"?: string
}

/** Options above this and the search box appears on its own. */
const SEARCH_THRESHOLD = 8

/** Gap between the trigger and the panel, and the panel's viewport margin. */
const PANEL_GAP = 6
const VIEWPORT_MARGIN = 8

/** Room the panel wants below the trigger before it flips above instead. */
const PANEL_SPACE = 280

/** Never squeeze the panel below this, however tight the viewport is. */
const PANEL_MIN_HEIGHT = 160

const SIZE_CLASS: Record<Size, string> = {
  sm: styles.triggerSm,
  md: "",
  lg: styles.triggerLg,
}

/** Where the desktop panel was placed, in viewport coordinates. */
interface PanelAnchor {
  left: number
  width: number
  /** One of these two; the other is undefined and drops out of the style. */
  top?: number
  bottom?: number
  maxHeight: number
  flipped: boolean
}

export default function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  helperText,
  error,
  size = "md",
  disabled = false,
  required = false,
  name,
  id,
  className,
  searchable,
  sheetTitle,
  onBlur,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // `open` as the handlers see it, not as the last render left it. The
  // trigger's blur fires while opening (focus is moving to the search box),
  // and reading state there would report the field as left when it was not.
  const openRef = useRef(false)

  // The trigger's position at the moment the panel was placed against it.
  const anchorRectRef = useRef<{ top: number; left: number } | null>(null)

  const baseId = useId()
  const triggerId = id ?? `${baseId}-trigger`
  const labelId = `${baseId}-label`
  const listId = `${baseId}-list`
  const errorId = `${baseId}-error`
  const helperId = `${baseId}-helper`

  const isMobile = useMediaQuery("(max-width: 767px)")
  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD

  const selected = options.find((option) => option.value === value)

  const matches = useMemo((): SelectOption[] => {
    const q = query.trim().toLowerCase()
    if (!q) return options

    // Prefix matches sort first — typing "go" should offer Goalkeeper before
    // Right Wing Back. Same ranking as CountrySelect, over label/value/hint.
    const scored = options
      .map((option, index) => {
        const text = option.label.toLowerCase()
        const hint = option.hint?.toLowerCase() ?? ""
        if (text.startsWith(q)) return { option, rank: 0, index }
        if (option.value.toLowerCase() === q) return { option, rank: 1, index }
        if (text.includes(q)) return { option, rank: 2, index }
        if (hint.includes(q)) return { option, rank: 3, index }
        return null
      })
      .filter((m): m is { option: SelectOption; rank: number; index: number } => m !== null)

    scored.sort((a, b) => a.rank - b.rank || a.index - b.index)
    return scored.map((m) => m.option)
  }, [options, query])

  const firstEnabled = () => matches.findIndex((option) => !option.disabled)
  const lastEnabled = () => {
    for (let i = matches.length - 1; i >= 0; i--) {
      if (!matches[i].disabled) return i
    }
    return -1
  }

  const handleClose = useCallback(() => {
    openRef.current = false
    setOpen(false)
    setQuery("")
    setActiveIndex(-1)
    setAnchor(null)
  }, [])

  // One history entry while the sheet is up, so the Android back gesture
  // closes the select instead of leaving the page it was opened on. Disabled
  // for the desktop dropdown, where there is no back gesture to serve and an
  // entry per dropdown would be noise.
  const { requestClose } = useBackToClose(handleClose, { enabled: open && isMobile })

  /**
   * Close the panel. `refocus` puts the caret back on the trigger — always
   * with `preventScroll`, since a scroll-close would otherwise drag the page
   * back to a field the reader has already left behind.
   */
  const close = useCallback(
    (refocus: boolean) => {
      openRef.current = false
      requestClose()
      if (refocus) triggerRef.current?.focus({ preventScroll: true })
    },
    [requestClose]
  )

  /** Place the panel against the trigger, in viewport coordinates. */
  const measure = useCallback(() => {
    const element = triggerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    anchorRectRef.current = { top: rect.top, left: rect.left }

    const below = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN
    const above = rect.top - PANEL_GAP - VIEWPORT_MARGIN
    // Flip only when going up actually buys room: a field near the top of a
    // short modal has too little on both sides, and above would be worse.
    const flipped = below < PANEL_SPACE && above > below

    const width = Math.min(rect.width, window.innerWidth - VIEWPORT_MARGIN * 2)
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    )

    setAnchor({
      left,
      width,
      top: flipped ? undefined : rect.bottom + PANEL_GAP,
      bottom: flipped ? window.innerHeight - rect.top + PANEL_GAP : undefined,
      maxHeight: Math.max(PANEL_MIN_HEIGHT, flipped ? above : below),
      flipped,
    })
  }, [])

  const openPanel = useCallback(
    (seed = "") => {
      if (disabled) return
      // Measured before the state change so the panel's first paint is
      // already in the right place — no frame of it sitting at 0,0.
      if (!isMobile) measure()
      openRef.current = true
      setQuery(seed)
      setOpen(true)
    },
    [disabled, isMobile, measure]
  )

  const choose = (option: SelectOption) => {
    if (option.disabled) return
    onChange(option.value)
    close(true)
  }

  // The sheet covers the page, so it locks it. The anchored dropdown does not
  // — see useCloseOnScroll below.
  useBodyScrollLock(open && isMobile)

  useCloseOnScroll(open && !isMobile, () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    const placed = anchorRectRef.current
    if (!rect || !placed) return
    // The hook listens in the capture phase, so it also hears the options
    // list scrolling itself. Only a scroll that MOVED the trigger has left
    // the panel hanging next to nothing; that is the one that closes.
    if (Math.abs(rect.top - placed.top) < 1 && Math.abs(rect.left - placed.left) < 1) return
    close(true)
  })

  // Open on the selected row, or the first one that can be chosen.
  useEffect(() => {
    if (!open) return
    const selectedIndex = matches.findIndex(
      (option) => option.value === value && !option.disabled
    )
    setActiveIndex(selectedIndex !== -1 ? selectedIndex : matches.findIndex((o) => !o.disabled))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Typing changes the list under the cursor: keep the active row on
  // something that still exists and can still be picked.
  useEffect(() => {
    if (!open) return
    setActiveIndex((current) => {
      if (current >= 0 && current < matches.length && !matches[current].disabled) return current
      return matches.findIndex((option) => !option.disabled)
    })
  }, [matches, open])

  // Keep the active row in view — on open that is the selected one, which in
  // a hundred-entry year list is nowhere near the top.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  // Desktop only. Autofocusing the search on a phone throws the on-screen
  // keyboard over the sheet the user has not read yet; there it focuses when
  // they tap it, which is when they have asked for it.
  useEffect(() => {
    if (!open || isMobile || !showSearch) return
    searchRef.current?.focus()
  }, [open, isMobile, showSearch])

  // Reposition while the panel is up: a window resize (or a desktop browser
  // zoom) moves the trigger without scrolling anything.
  useEffect(() => {
    if (!open || isMobile) return
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open, isMobile, measure])

  // Esc closes the select and NOTHING else. Captured on the document so it
  // runs before the host modal's own bubble-phase handler — otherwise one
  // press would close the dropdown and the form behind it.
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      event.preventDefault()
      close(true)
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [open, close])

  // Outside click closes the desktop dropdown; the sheet has its own backdrop.
  useEffect(() => {
    if (!open || isMobile) return
    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      // No refocus: the reader has clicked somewhere else on purpose.
      close(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, isMobile, close])

  const moveActive = (direction: 1 | -1) => {
    setActiveIndex((current) => {
      let next = current
      for (;;) {
        next += direction
        if (next < 0 || next >= matches.length) return current
        if (!matches[next].disabled) return next
      }
    })
  }

  /** Shared by the trigger and the search box — whichever has focus. */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        openPanel()
        return
      }
      // A printable key opens and seeds the search, the way a native select
      // jumps to a letter. Without a search box it just opens.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        openPanel(showSearch ? event.key : "")
      }
      return
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        moveActive(1)
        break
      case "ArrowUp":
        event.preventDefault()
        moveActive(-1)
        break
      case "Home":
        event.preventDefault()
        setActiveIndex(firstEnabled())
        break
      case "End":
        event.preventDefault()
        setActiveIndex(lastEnabled())
        break
      case "Enter": {
        event.preventDefault()
        const option = matches[activeIndex]
        if (option) choose(option)
        break
      }
      case " ": {
        // Space picks the active row from the trigger — but inside the search
        // box it is a space, and stealing it would make two-word labels
        // unsearchable.
        if (event.currentTarget === searchRef.current) break
        event.preventDefault()
        const option = matches[activeIndex]
        if (option) choose(option)
        break
      }
      case "Tab":
        close(false)
        break
    }
  }

  const activeId = activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined

  const describedBy =
    [error ? errorId : null, helperText && !error ? helperId : null].filter(Boolean).join(" ") ||
    undefined

  const renderSearch = () =>
    showSearch ? (
      <div className={styles.searchWrap}>
        <Icon
          icon="mdi:magnify"
          width={16}
          height={16}
          className={styles.searchIcon}
          aria-hidden="true"
        />
        <input
          ref={searchRef}
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          aria-label={`Search ${label ?? ariaLabel ?? "options"}`}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </div>
    ) : null

  const renderList = (variant: "panel" | "sheet") => (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={label ?? ariaLabel ?? "Options"}
      className={clsx(styles.list, variant === "sheet" && styles.listSheet)}
    >
      {matches.map((option, index) => (
        <li
          key={option.value}
          id={`${baseId}-option-${index}`}
          data-index={index}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          className={clsx(
            styles.option,
            index === activeIndex && styles.optionActive,
            option.value === value && styles.optionSelected,
            option.disabled && styles.optionDisabled
          )}
          onMouseEnter={() => {
            if (!option.disabled) setActiveIndex(index)
          }}
          onClick={() => choose(option)}
        >
          {option.icon && (
            <Icon
              icon={option.icon}
              width={18}
              height={18}
              className={styles.optionIcon}
              aria-hidden="true"
            />
          )}
          <span className={styles.optionText}>
            <span className={styles.optionLabel}>{option.label}</span>
            {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
          </span>
          {option.value === value && (
            <Icon
              icon="mdi:check"
              width={16}
              height={16}
              className={styles.optionCheck}
              aria-hidden="true"
            />
          )}
        </li>
      ))}

      {matches.length === 0 && (
        <li className={styles.empty} role="presentation">
          No matches for “{query}”
        </li>
      )}
    </ul>
  )

  return (
    <div className={clsx(styles.field, className)}>
      {label && (
        <label className={styles.label} id={labelId} htmlFor={triggerId}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className={clsx(
          styles.trigger,
          SIZE_CLASS[size],
          error && styles.triggerError,
          open && styles.triggerOpen
        )}
        disabled={disabled}
        onClick={() => (open ? close(true) : openPanel())}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Opening moves focus into the search box; that is not the field
          // being left, and reporting it would mark the form touched on a
          // click the user has not finished making.
          if (!openRef.current) onBlur?.()
        }}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
      >
        <span className={clsx(styles.value, !selected && styles.placeholder)}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <Icon
          icon="mdi:chevron-down"
          width={20}
          height={20}
          className={styles.chevron}
          aria-hidden="true"
        />
      </button>

      {/* There is no native control behind this, so an enclosing <form> would
          otherwise submit without the value. */}
      {name && <input type="hidden" name={name} value={value} />}

      {error && (
        <p className={styles.errorMsg} id={errorId} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={12} height={12} aria-hidden="true" />
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className={styles.helper} id={helperId}>
          {helperText}
        </p>
      )}

      {/* Desktop: anchored dropdown, portalled out of whatever clips it. */}
      {open && !isMobile && anchor && (
        <Portal>
          <div
            ref={panelRef}
            className={clsx(styles.panel, anchor.flipped && styles.panelAbove)}
            /* Lets the scroll lock's touchmove guard find this list as a
               scroller it should allow, on a touch screen wide enough for the
               dropdown. */
            data-scroll-lock-root=""
            style={{
              left: anchor.left,
              width: anchor.width,
              top: anchor.top,
              bottom: anchor.bottom,
              maxHeight: anchor.maxHeight,
            }}
          >
            {renderSearch()}
            {renderList("panel")}
          </div>
        </Portal>
      )}

      {/* Mobile: bottom sheet. */}
      {open && isMobile && (
        <Portal>
          <div
            className={styles.sheetBackdrop}
            onClick={(event) => {
              if (event.target === event.currentTarget) close(true)
            }}
            role="dialog"
            aria-modal="true"
            aria-label={sheetTitle ?? label ?? ariaLabel ?? "Select an option"}
          >
            <div className={styles.sheet} ref={panelRef}>
              <div className={styles.sheetHandle} aria-hidden="true" />
              <div className={styles.sheetHeader}>
                <div className={styles.sheetSpacer} />
                <h2 className={styles.sheetTitle}>{sheetTitle ?? label ?? "Select"}</h2>
                <button
                  className={styles.sheetClose}
                  type="button"
                  onClick={() => close(true)}
                  aria-label="Close"
                >
                  <Icon icon="mdi:close" width={20} height={20} />
                </button>
              </div>
              {renderSearch()}
              <div className={styles.sheetContent}>{renderList("sheet")}</div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
