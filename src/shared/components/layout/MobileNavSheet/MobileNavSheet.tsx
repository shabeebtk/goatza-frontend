"use client"

/**
 * MobileNavSheet — the mobile navigation dock: the tab bar and the sheet it
 * expands into, as ONE fixed container.
 *
 * The bottom bar holds five tabs; the app has more than five places. The old
 * answer was a long press on the avatar, which hid account switching behind a
 * gesture nobody discovers. The answer before this one was a separate fixed
 * sheet pulled up OVER the bar — which worked, but read as a popup appearing
 * rather than the bar expanding.
 *
 * So: one dock, anchored to the bottom.
 *
 *     <div class="dock">              fixed, bottom: 0, sized to the BAR
 *       <div class="body" />          absolute, bottom: 100% — directly above it
 *       <nav class="bar" />           the five tabs, the dock's footer
 *     </div>
 *
 * The body is out of flow (absolute), so the dock's own box stays exactly the
 * bar's height — which is what the `bottom-bar` html flag and the toast
 * offsets measure, and what useScrollChrome slides away on scroll.
 *
 * Collapsed, the body is translated down by exactly its own height
 * (`translateY(100%)`), which parks it behind the opaque bar and below the
 * fold. Expanded, it is at `translateY(0)`, sitting on the bar. Between the
 * two it follows the finger. Because both share the dock's surface, with no
 * gap and no separate shadow, the motion reads as the bar growing a body
 * upward and folding it back down — the same motion in reverse, nothing
 * appearing or disappearing.
 *
 * The body is mounted in both states, because a drag has to be able to pull a
 * collapsed body into view. Collapsed it carries `inert` and `aria-hidden`,
 * so it is neither tappable nor in the accessibility tree.
 *
 * It is deliberately NOT config-driven: AppNav feeds it getSheetSections()
 * and its five tabs, OrgNav shapes its own inline nav into the same props, so
 * one component is the whole mobile nav for both shells.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { LOGOUT_CONFIRM } from "@/features/auth/hooks/useLogout"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import useIsMounted from "@/shared/hooks/useIsMounted"
import { returnFocus } from "@/shared/services/focusReturn"
import type { ActorType, OrganizationActor, User } from "@/store/auth.store"
import { NAV_DRAG_REGION_ATTR, useSheetDrag } from "./useSheetDrag"
import styles from "./MobileNavSheet.module.css"

/** One destination tile in the sheet body. */
export interface NavSheetTile {
  id: string
  label: string
  /** Absent on a tile that is not navigable yet (coming soon). */
  href?: string
  icon: string
  iconActive: string
  /** Prefix the active state matches, when it differs from href (/profile). */
  match?: string
  /** Unread count to show on the tile. */
  badge?: number
  disabled?: boolean
  comingSoon?: boolean
}

/** A titled group of tiles — "Discover"/"You", or "Manage"/"Grow" for an org. */
export interface NavSheetGroup {
  id: string
  title: string
  items: readonly NavSheetTile[]
}

/**
 * One of the five tabs in the dock's bar. The dock renders them so there is a
 * single implementation of the bar for both shells; the shells say what they
 * are and own the create modal.
 */
export type NavDockTab =
  | {
      kind: "link"
      id: string
      label: string
      href: string
      icon: string
      iconActive: string
      badge?: number
    }
  | { kind: "create"; id: string; label: string; icon: string; onSelect: () => void }
  | {
      kind: "profile"
      id: string
      label: string
      /**
       * Where the tab goes: the reader's OWN profile, resolved by the shell
       * (/profile/<username>, or the org's admin profile). The tab used to
       * be the dock's open button; the dock opens by swiping the bar up, and
       * a profile tab that does not go to the profile is a trap.
       */
      href: string
      /** Prefix that lights the tab up — /profile, or the org's own. */
      match: string
      avatarUrl?: string | null
      initials: string
      isOrganization?: boolean
    }

/** An account the reader can act as, for the inline switcher. */
interface AccountRow {
  id: string
  name: string
  sub: string
  avatarUrl?: string | null
  initials: string
  current: boolean
  isOrganization: boolean
  onSelect: () => void
}

export interface MobileNavSheetProps {
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** The five tabs of the bar, in order. */
  tabs: readonly NavDockTab[]
  sections: readonly NavSheetGroup[]
  /** The footer row, in order. Log out is appended by the sheet. */
  footerItems: readonly NavSheetTile[]
  pathname: string
  /** Who you are acting as right now, for the account header. */
  account: {
    name: string
    avatarUrl?: string | null
    initials: string
    /** "Player · Switch account", "Admin · Switch account". */
    roleLabel: string
    isOrganization?: boolean
  }
  /** False on a chat page, where the chrome is hidden entirely. */
  visible?: boolean
  mode: "user" | "organization"
  actorType: ActorType
  actorId: string | null
  organizations: OrganizationActor[]
  user: User | null
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
}

/** Remembers that the swipe-up hint has had its one chance. */
const HINT_SEEN_KEY = "goatza:nav-sheet-hint-seen"
/** Long enough after mount that the page has settled and the nudge is noticed. */
const HINT_DELAY_MS = 1200
/** How long the pill stays before it gets out of the way. */
const HINT_VISIBLE_MS = 3000
/** Where AccountSwitcher's "Create Page" goes; the account list ends here too. */
const CREATE_PAGE_HREF = "/organization/create"

/** Focusables inside the body, for the Tab trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea'

/**
 * Longest-prefix active match. Plain `startsWith` lights up two tiles at once
 * (/settings and /settings/saved), so the most specific href wins and the
 * others stay idle.
 */
function activeTileId(
  pathname: string,
  sections: readonly NavSheetGroup[],
  footerItems: readonly NavSheetTile[]
): string | null {
  let bestId: string | null = null
  let bestLength = 0

  const consider = (tile: NavSheetTile) => {
    if (tile.disabled) return
    const prefix = tile.match ?? tile.href
    if (!prefix) return
    const hit = pathname === prefix || pathname.startsWith(`${prefix}/`)
    if (hit && prefix.length > bestLength) {
      bestLength = prefix.length
      bestId = tile.id
    }
  }

  for (const section of sections) section.items.forEach(consider)
  footerItems.forEach(consider)
  return bestId
}

/** Unread pip, shared by the bar's tabs and the sheet's tiles. */
function NotifDot({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className={styles.notifBadge} aria-hidden="true">
      {count > 9 ? "9+" : count}
    </span>
  )
}

export default function MobileNavSheet({
  open,
  onOpen,
  onClose,
  tabs,
  sections,
  footerItems,
  pathname,
  account,
  visible = true,
  mode,
  actorType,
  actorId,
  organizations,
  user,
  onSwitchToUser,
  onSwitchToOrganization,
  onLogout,
}: MobileNavSheetProps) {
  const router = useRouter()
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [switcherOpen, setSwitcherOpen] = useState(false)
  /**
   * LOG OUT ASKS FIRST, and asks on an empty screen.
   *
   * The dock collapses before the question appears — the two cannot share a
   * screen. Both are overlays with a history entry, an Esc handler and a
   * focus trap of their own; stacked, one back press would answer a question
   * with the menu still visible behind it.
   *
   * So this is the ASK, and the dialog is up only once the dock is actually
   * down — derived, not sequenced by an effect: the footer sets it and
   * collapses, and the question appears on the far side of the collapse,
   * after the dock's history entry has been consumed.
   */
  const [logoutAsked, setLogoutAsked] = useState(false)
  const logoutAsk = logoutAsked && !open
  const mounted = useIsMounted()
  const titleId = useId()
  const bodyId = `${titleId}-body`

  const panelRef = useRef<HTMLDivElement | null>(null)
  /**
   * What to give focus back to when the body collapses: whatever was focused
   * when it went up. The dock is opened by a drag now, so there is no opener
   * button to record — on a phone that is nothing, and for a keyboard reader
   * it is the control they were on.
   */
  const openerRef = useRef<HTMLElement | null>(null)

  // One history entry while expanded, so Android's back gesture collapses the
  // dock instead of leaving the page. navigateAway is how a tile leaves: it
  // pops that entry FIRST, so back from the destination returns to the page
  // rather than to a dead overlay entry.
  const { requestClose, navigateAway } = useBackToClose(onClose, { enabled: open })

  // ── The one-time hint ─────────────────────────────────────────────────────
  // Read in the state initialiser rather than an effect, which would cascade
  // a second render on every mount of the nav. Unreadable storage counts as
  // "seen": a private tab that cannot remember must not nag on every page.
  const [hintSeen, setHintSeen] = useState(() => {
    try {
      return typeof window === "undefined" || !!window.localStorage.getItem(HINT_SEEN_KEY)
    } catch {
      return true
    }
  })
  const [hintPlaying, setHintPlaying] = useState(false)

  const retireHint = useCallback(() => {
    setHintSeen(true)
    setHintPlaying(false)
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1")
    } catch {
      /* nothing to remember it with; it gets one more chance next load */
    }
  }, [])

  // Both ways in — a tap on the avatar tab and the drag's commit — go through
  // here, so opening the dock once is enough to retire the hint for good.
  const handleOpen = useCallback(() => {
    retireHint()
    onOpen()
  }, [onOpen, retireHint])

  const { bodyRef, backdropRef, scrollRef, dragging, settling, onPointerDown, bodyHeight } =
    useSheetDrag({
      open,
      onOpen: handleOpen,
      onClose: requestClose,
      reducedMotion,
    })

  // The page must not move behind the expanded body — including through the
  // settle, or it would scroll for the 320ms the collapse is still running.
  useBodyScrollLock(open || settling)

  // The nudge: a short while after the bar appears, the body peeks above it
  // and a pill names the gesture. The key is written as the sequence STARTS,
  // not when it ends, so a reload mid-bounce can never loop it.
  useEffect(() => {
    if (hintSeen || open || !visible) return

    const start = window.setTimeout(() => {
      setHintPlaying(true)
      try {
        window.localStorage.setItem(HINT_SEEN_KEY, "1")
      } catch {
        /* unreadable storage already counts as seen; nothing to do */
      }
    }, HINT_DELAY_MS)

    return () => window.clearTimeout(start)
  }, [hintSeen, open, visible])

  // It says its piece and leaves.
  useEffect(() => {
    if (!hintPlaying) return
    const done = window.setTimeout(() => setHintPlaying(false), HINT_VISIBLE_MS)
    return () => window.clearTimeout(done)
  }, [hintPlaying])

  const close = useCallback(() => {
    setSwitcherOpen(false)
    requestClose()
  }, [requestClose])

  /** The first touch anywhere on the bar is answer enough; the pill can go. */
  const onBarPointerDown = useCallback(() => {
    if (hintPlaying) retireHint()
  }, [hintPlaying, retireHint])

  // Focus in when it expands, back to the opener when it collapses.
  // returnFocus keeps the ring off for a reader who tapped — iOS treats
  // programmatic focus as :focus-visible and would leave a green ring behind.
  useEffect(() => {
    if (!open) return
    const previous = openerRef.current ?? (document.activeElement as HTMLElement | null)
    openerRef.current = previous
    panelRef.current?.focus({ preventScroll: true })

    return () => {
      setSwitcherOpen(false)
      returnFocus(openerRef.current)
      openerRef.current = null
    }
  }, [open])

  // Esc collapses (harmless at desktop width, where the dock is display:none),
  // and Tab is trapped inside the body while it is expanded.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return
      // No visibility filter: everything focusable in here is rendered only
      // when it is on screen (the account list is mounted, not hidden), and
      // an `offsetParent` test would read null for the whole panel under
      // jsdom, which would empty the list entirely.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, close])

  /**
   * Leaving by a tile or a tab. The anchor stays a real <a> — middle-click,
   * long-press "open in new tab" and the status bar URL all keep working —
   * but a plain tap goes through navigateAway so the dock's history entry is
   * consumed before the push, and the dock collapses on the way out.
   */
  const goTo = useCallback(
    (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.button !== 0) return
      event.preventDefault()
      setSwitcherOpen(false)
      if (open) navigateAway(href)
      else router.push(href)
    },
    [navigateAway, open, router]
  )

  // ── The accounts list ─────────────────────────────────────────────────────
  // Built here rather than reusing AccountSwitcherContent: that body brings
  // its own profile header, Settings, Create page and Logout, which inside
  // this sheet read as a nested card and duplicated the footer below it.
  // AccountSwitcher itself is untouched — it is still the desktop dropdown.
  const accountRows: AccountRow[] = [
    {
      id: "__personal",
      name: user?.name || "Personal account",
      // Acting as an org, this row is the way back, and says so.
      sub: mode === "organization" ? "Switch to personal" : "Personal account",
      avatarUrl: user?.profile_photo,
      initials: user?.name?.slice(0, 2).toUpperCase() || "U",
      current: actorType === "user",
      isOrganization: false,
      onSelect: onSwitchToUser,
    },
    ...organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      sub: "Organization",
      avatarUrl: organization.logo,
      initials: organization.name?.slice(0, 2).toUpperCase() || "OR",
      current: actorType === "organization" && actorId === organization.id,
      isOrganization: true,
      onSelect: () => onSwitchToOrganization(organization.id),
    })),
  ]

  const activeId = activeTileId(pathname, sections, footerItems)
  const state = dragging ? "dragging" : open ? "open" : settling ? "settling" : "closed"
  const resting = !open && !dragging && !settling
  const showHint = mounted && hintPlaying

  const renderTile = (tile: NavSheetTile) => {
    const isActive = tile.id === activeId
    const icon = isActive ? tile.iconActive : tile.icon

    const inner = (
      <>
        <span className={styles.tileIcon} aria-hidden="true">
          <Icon icon={icon} width={24} height={24} />
          <NotifDot count={tile.badge ?? 0} />
        </span>
        <span className={styles.tileLabel}>{tile.label}</span>
        {tile.comingSoon && <span className={styles.tileSoon}>Soon</span>}
      </>
    )

    // Not navigable: a span, so it is never focusable and never a dead link.
    if (tile.disabled || !tile.href) {
      return (
        <span
          key={tile.id}
          className={`${styles.tile} ${styles.tileDisabled}`}
          aria-disabled="true"
          aria-label={tile.comingSoon ? `${tile.label} — coming soon` : tile.label}
        >
          {inner}
        </span>
      )
    }

    return (
      <Link
        key={tile.id}
        href={tile.href}
        className={`${styles.tile} ${isActive ? styles.tileActive : ""}`}
        aria-current={isActive ? "page" : undefined}
        aria-label={
          tile.badge && tile.badge > 0 ? `${tile.label}, ${tile.badge} unread` : tile.label
        }
        onClick={goTo(tile.href)}
      >
        {inner}
      </Link>
    )
  }

  /** A tab in the bar. Works the same whether the body is up or down. */
  const renderTab = (tab: NavDockTab) => {
    if (tab.kind === "create") {
      return (
        <button
          key={tab.id}
          type="button"
          className={styles.barTabCreate}
          aria-label={tab.label}
          onClick={() => {
            if (open) close()
            tab.onSelect()
          }}
        >
          <span className={styles.barTabCreateInner} aria-hidden="true">
            <Icon icon={tab.icon} width={28} height={28} />
          </span>
        </button>
      )
    }

    if (tab.kind === "profile") {
      const isActive = pathname.startsWith(tab.match)
      // A DESTINATION, not a disclosure. It used to toggle the dock, which
      // made the one tab shaped like "you" the only tab that did not go
      // anywhere — and left the dock with two open gestures. The swipe up on
      // the bar is the one way in now, so this is just the profile tab:
      // goTo collapses the dock on its way out if it happens to be up.
      return (
        <Link
          key={tab.id}
          href={tab.href}
          className={`${styles.barTab} ${isActive ? styles.barTabActive : ""}`}
          aria-label={tab.label}
          aria-current={isActive ? "page" : undefined}
          onClick={goTo(tab.href)}
        >
          <span className={styles.barTabAvatarWrap}>
            <Avatar
              src={tab.avatarUrl ?? undefined}
              initials={tab.initials}
              size="xs"
              className={isActive ? styles.barTabAvatarActive : ""}
            />
            {tab.isOrganization && (
              <span className={styles.barTabPip} aria-hidden="true">
                <Icon icon="mdi:office-building" width={8} height={8} />
              </span>
            )}
          </span>
        </Link>
      )
    }

    const isActive = pathname.startsWith(tab.href)

    return (
      <Link
        key={tab.id}
        href={tab.href}
        className={`${styles.barTab} ${isActive ? styles.barTabActive : ""}`}
        aria-label={
          tab.badge && tab.badge > 0 ? `${tab.label}, ${tab.badge} unread` : tab.label
        }
        aria-current={isActive ? "page" : undefined}
        onClick={goTo(tab.href)}
      >
        <span className={styles.barTabIcon} aria-hidden="true">
          <Icon icon={isActive ? tab.iconActive : tab.icon} width={26} height={26} />
          <NotifDot count={tab.badge ?? 0} />
        </span>
      </Link>
    )
  }

  if (!visible) return null

  return (
    <>
      <div
        ref={backdropRef}
        className={styles.backdrop}
        data-state={state}
        onClick={close}
        aria-hidden="true"
      />

      {/* ONE container. Its own box is the bar; the body hangs above it. */}
      <div className={styles.dock} data-state={state}>
        {/* The pill that names the gesture, once, above the bar. */}
        {showHint && (
          <div className={styles.hint} aria-hidden="true">
            <Icon icon="mdi:chevron-up" width={16} height={16} />
            Swipe up for more
          </div>
        )}

        <div
          ref={bodyRef}
          id={bodyId}
          className={styles.body}
          data-state={state}
          data-hint={showHint && !reducedMotion ? "" : undefined}
          inert={resting || undefined}
          aria-hidden={resting || undefined}
        >
          <div
            ref={panelRef}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            {/* The drag handle, and the body's non-scrolling top. touch-action
                none here, plus data-allow-touchmove so useBodyScrollLock's
                touchmove blocker lets the gesture through.

                No ✕: the body is dragged down, the backdrop is tapped, the
                back gesture and Esc both close it. A button for a fifth way
                out only took room from the handle that teaches the first. */}
            <div className={styles.dragZone} onPointerDown={onPointerDown} data-allow-touchmove="">
              <span className={styles.handle} aria-hidden="true" />
              {/* The dialog's accessible name. Visually hidden: the handle
                  above it is what a sighted reader reads. */}
              <h2 id={titleId} className={styles.srOnly}>
                Navigation
              </h2>
            </div>

            <div className={styles.account} onPointerDown={onPointerDown} data-allow-touchmove="">
              <button
                type="button"
                className={styles.accountBtn}
                onClick={() => setSwitcherOpen((isOpen) => !isOpen)}
                aria-expanded={switcherOpen}
              >
                <span className={styles.accountAvatar}>
                  <Avatar
                    src={account.avatarUrl ?? undefined}
                    initials={account.initials}
                    size="md"
                    online={!account.isOrganization}
                  />
                  {account.isOrganization && (
                    <span className={styles.accountPip} aria-hidden="true">
                      <Icon icon="mdi:office-building" width={10} height={10} />
                    </span>
                  )}
                </span>
                <span className={styles.accountText}>
                  <span className={styles.accountName}>{account.name}</span>
                  <span className={styles.accountMeta}>{account.roleLabel}</span>
                </span>
                <Icon
                  icon={switcherOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                  width={20}
                  height={20}
                  className={styles.accountChevron}
                  aria-hidden="true"
                />
              </button>
            </div>

            <div ref={scrollRef} className={styles.scroll} onPointerDown={onPointerDown}>
              {switcherOpen && (
                <div className={styles.accounts} role="group" aria-label="Switch account">
                  {accountRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`${styles.accountRow} ${row.current ? styles.accountRowCurrent : ""}`}
                      aria-current={row.current ? "true" : undefined}
                      onClick={() => {
                        setSwitcherOpen(false)
                        // The shells' own handlers clear the query cache,
                        // route, and close the dock — so this must not also
                        // pop history, or the two would race.
                        row.onSelect()
                      }}
                    >
                      <span className={styles.accountRowAvatar}>
                        <Avatar src={row.avatarUrl ?? undefined} initials={row.initials} size="xs" />
                        {row.isOrganization && (
                          <span className={styles.accountRowPip} aria-hidden="true">
                            <Icon icon="mdi:office-building" width={8} height={8} />
                          </span>
                        )}
                      </span>
                      <span className={styles.accountRowText}>
                        <span className={styles.accountRowName}>{row.name}</span>
                        <span className={styles.accountRowSub}>{row.sub}</span>
                      </span>
                      {row.current && (
                        <span className={styles.accountRowCheck} aria-hidden="true">
                          <Icon icon="mdi:check" width={16} height={16} />
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Last row of the SAME list, not a section of its own. */}
                  <Link
                    href={CREATE_PAGE_HREF}
                    className={styles.accountRow}
                    onClick={goTo(CREATE_PAGE_HREF)}
                  >
                    <span className={styles.accountRowPlus} aria-hidden="true">
                      <Icon icon="mdi:plus" width={18} height={18} />
                    </span>
                    <span className={styles.accountRowText}>
                      <span className={styles.accountRowName}>Create a page</span>
                      <span className={styles.accountRowSub}>Club, academy or team</span>
                    </span>
                  </Link>
                </div>
              )}

              {sections.map((section) =>
                section.items.length === 0 ? null : (
                  <section key={section.id} className={styles.group}>
                    <h3 className={styles.groupTitle}>{section.title}</h3>
                    <div className={styles.tiles}>{section.items.map(renderTile)}</div>
                  </section>
                )
              )}

              <div className={styles.footer}>
                {footerItems.map((item) => {
                  const isActive = item.id === activeId
                  if (item.disabled || !item.href) {
                    return (
                      <span
                        key={item.id}
                        className={`${styles.footerItem} ${styles.footerItemDisabled}`}
                        aria-disabled="true"
                      >
                        <Icon icon={item.icon} width={18} height={18} aria-hidden="true" />
                        {item.label}
                      </span>
                    )
                  }
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`${styles.footerItem} ${isActive ? styles.footerItemActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={goTo(item.href)}
                    >
                      <Icon
                        icon={isActive ? item.iconActive : item.icon}
                        width={18}
                        height={18}
                        aria-hidden="true"
                      />
                      {item.label}
                    </Link>
                  )
                })}

                <button
                  type="button"
                  className={`${styles.footerItem} ${styles.footerItemDanger}`}
                  onClick={() => {
                    setLogoutAsked(true)
                    close()
                  }}
                >
                  <Icon icon="mdi:logout" width={18} height={18} aria-hidden="true" />
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* The dock's footer in both states: the five tabs. An upward drag
            starting anywhere on it pulls the body up — useSheetDrag
            hit-tests this attribute rather than the pointer's coordinates. */}
        <nav
          className={styles.bar}
          aria-label="Tab navigation"
          onPointerDown={onBarPointerDown}
          {...{ [NAV_DRAG_REGION_ATTR]: "" }}
        >
          {tabs.map(renderTab)}
        </nav>
      </div>

      {/* Asked after the dock is down, so the only thing on screen is the
          question. onLogout is the real thing — the shells hand it straight
          to useLogout. */}
      <ConfirmDialog
        open={logoutAsk}
        {...LOGOUT_CONFIRM}
        tone="danger"
        onConfirm={() => {
          setLogoutAsked(false)
          onLogout()
        }}
        onCancel={() => setLogoutAsked(false)}
      />
    </>
  )
}
