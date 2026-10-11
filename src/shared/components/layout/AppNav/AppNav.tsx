"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./AppNav.module.css"
import { LOGO_URL } from "@/constants"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"
import { useAuthStore } from "@/store/auth.store"
import { LOGOUT_CONFIRM, useLogout } from "@/features/auth/hooks/useLogout"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useQueryClient } from "@tanstack/react-query"
import AccountSwitcher from "@/shared/components/layout/AccountSwitcher/AccountSwitcher"
import { useUnreadCount } from "@/features/Notifications/hooks/useNotificationQueries"
import { useConversationsUnreadSummary } from "@/features/messages/hooks/useConversationQueries"
import { useScrollChrome } from "@/shared/hooks/useScrollChrome"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import MobileNavSheet, {
  type NavDockTab,
  type NavSheetGroup,
  type NavSheetTile,
} from "@/shared/components/layout/MobileNavSheet/MobileNavSheet"
import { ROLE_META } from "@/shared/constants/roles"
import NavMoreMenu, { type MoreMenuRow } from "@/shared/components/layout/NavMoreMenu/NavMoreMenu"
import {
  getBottomNav,
  getDesktopMore,
  getDesktopPrimary,
  getDesktopRight,
  getNavItems,
  getSheetFooter,
  getSheetSections,
  getTopBarNav,
  type LinkNavItem,
  type NavBadgeKey,
  type NavDestination,
} from "@/config/navigation"

/** Group ids from the config, titled for the sheet. */
const SHEET_GROUP_TITLES: Record<string, string> = {
  discover: "Discover",
  you: "You",
}

/**
 * Help has no route of its own; "Report a problem" is where a reader goes for
 * one, so the sheet's Help footer item points there.
 */
const HELP_TILE: NavSheetTile = {
  id: "help",
  label: "Help",
  href: "/report-problem",
  icon: "mdi:help-circle-outline",
  iconActive: "mdi:help-circle",
}

function LogoMark() {
  return (
    <Link href="/home" aria-label="Goatza home" className={styles.logoLink}>
      <div className={styles.logoImgWrap}>
        <img src={LOGO_URL} alt="" aria-hidden="true" className={styles.logoImg} />
      </div>
      <span className={styles.logoWordmark}>Goatza</span>
    </Link>
  )
}

function NotifDot({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className={styles.notifBadge} aria-label={`${count} notifications`}>
      {count > 9 ? "9+" : count}
    </span>
  )
}

// Skeleton chrome shown until the user's role resolves, so a wrong nav never
// flashes for coach/scout. Matches the real bars' geometry to avoid layout shift.
function NavSkeleton() {
  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <LogoMark />
          <nav className={styles.topNavLinks} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={styles.skeletonPill} />
            ))}
          </nav>
          <div className={styles.topNavRight}>
            <span className={styles.skeletonPillWide} aria-hidden="true" />
            <span className={styles.skeletonCircle} aria-hidden="true" />
          </div>
        </div>
      </header>

      <header className={styles.mobileTopBar} role="banner" aria-hidden="true">
        <LogoMark />
        <div className={styles.mobileTopActions}>
          <span className={styles.skeletonCircle} />
          <span className={styles.skeletonCircle} />
        </div>
      </header>

      <nav className={styles.bottomBar} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={styles.bottomTab}>
            <span className={styles.skeletonCircle} />
          </span>
        ))}
      </nav>
    </>
  )
}

export default function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)

  const user = useAuthStore((state) => state.user)
  const actorType = useAuthStore((state) => state.actorType)
  const actorId = useAuthStore((state) => state.actorId)
  const organizations = useAuthStore((state) => state.organizations)
  const activeOrganization = useAuthStore((state) => state.currentOrganization)
  const switchToUser = useAuthStore((state) => state.switchToUser)
  const switchToOrganization = useAuthStore((state) => state.switchToOrganization)

  // Live badge counts for the current actor (headers scope these per user/org).
  const notifCount = useUnreadCount().data?.count ?? 0
  const messageCount = useConversationsUnreadSummary().data?.total ?? 0

  const isChatPage = /^\/messages\/.+/.test(pathname)

  // Scroll-linked auto-hide for the mobile chrome: the bars slide off as you
  // scroll down and follow you back on the way up, settling smoothly when you
  // stop. Inert on chat pages (bars already fully hidden there) and, via CSS,
  // on desktop. Drives the `--chrome-progress` var on <html> — no re-renders.
  // The sheet sits over the bar and the bar is the thing it grew out of —
  // letting the scroll hide it mid-sheet would pull the floor away. Disabled
  // also forces the chrome fully visible, which is exactly what is wanted.
  useScrollChrome({ enabled: !isChatPage && !mobileSheetOpen })

  // Nav is driven entirely by the role config — no role branching in JSX.
  const navItems = getNavItems(user?.role)

  // The profile tab and the avatar go STRAIGHT to /profile/<username> once the
  // session knows who this is. The config still says /profile — that route is
  // a redirect page (it renders nothing, then replaces itself with the real
  // URL) and stays the right target for a deep link or a click before the
  // session resolves. Going through it from the nav cost an extra hop on
  // every visit to your own profile: blank page, then the profile.
  // Active-state matching below stays on the config's `/profile`, so viewing
  // anyone's profile still lights the tab up exactly as before.
  const profileHref = user?.username ? `/profile/${user.username}` : "/profile"

  // The toasts offset themselves by the mobile bars only while the bars are
  // actually there: not on a public page, not on a chat page (bars hidden),
  // and not while the role is still resolving.
  const barsMounted = navItems !== null && !isChatPage
  useHtmlFlag("top-bar", barsMounted)
  useHtmlFlag("bottom-bar", barsMounted)
  const badgeCount = (badge: NavBadgeKey | undefined) =>
    badge === "messages" ? messageCount : badge === "notifications" ? notifCount : 0

  const postingOrganization =
    actorType === "organization"
      ? activeOrganization ?? organizations.find((organization) => organization.id === actorId)
      : null

  const postingProfile = postingOrganization
    ? {
        username: postingOrganization.username,
        avatarUrl: postingOrganization.logo,
        initials: postingOrganization.name?.slice(0, 2).toUpperCase() || "OR",
        displayName: postingOrganization.name,
      }
    : {
        username: user?.username || "",
        avatarUrl: user?.profile_photo,
        initials: user?.name?.slice(0, 2).toUpperCase() || "U",
        displayName: user?.name || "You",
      }

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setMobileSheetOpen(false)
      } else {
        setDropdownOpen(false)
        // The More panel is portalled, so it would otherwise outlive the bar
        // it hangs off when the window crosses into mobile.
        setMoreOpen(false)
      }
    }

    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const handleLogout = useLogout()
  /**
   * The desktop dropdown's Log out asks first. The dock's footer asks for
   * itself — it has to collapse before the question can be seen, so it owns
   * that sequence and is handed the real logout.
   */
  const [logoutAsk, setLogoutAsk] = useState(false)

  const handleSwitchToUser = () => {
    switchToUser()
    setDropdownOpen(false)
    setMobileSheetOpen(false)
    queryClient.clear()
    router.push("/home")
  }

  const handleSwitchToOrganization = (organizationId: string) => {
    switchToOrganization(organizationId)
    setDropdownOpen(false)
    setMobileSheetOpen(false)
    queryClient.clear()
    router.push(`/organization/admin/${organizationId}/dashboard`)
  }

  // Role not resolved yet → render skeleton chrome, no nav destinations.
  if (!navItems) {
    return <NavSkeleton />
  }

  // Three desktop clusters, not one flat list: destinations inline on the
  // left, Messages/Alerts as icons on the right, the rest behind More.
  const primaryItems = getDesktopPrimary(navItems)
  const rightItems = getDesktopRight(navItems)
  const moreItems = getDesktopMore(navItems)
  const topBarItems = getTopBarNav(navItems)
  const bottomItems = getBottomNav(navItems)

  // ── Expand-sheet data ──────────────────────────────────────────────────────
  // The sheet takes plain tiles rather than nav items, so OrgNav — which is
  // not config-driven — can feed the same component. The mapping is the only
  // place the two shapes meet.
  const toTile = (item: NavDestination): NavSheetTile => ({
    id: item.id,
    label: item.label,
    // The profile tile goes straight to the real URL for the same reason the
    // tab does, but still matches the config's /profile for its active state.
    href: item.kind === "profile" ? profileHref : item.href,
    match: item.kind === "profile" ? item.href : undefined,
    icon: item.icon,
    iconActive: item.iconActive,
    badge: badgeCount(item.badge),
    disabled: item.disabled,
    comingSoon: item.comingSoon,
  })

  const sheetSections: NavSheetGroup[] = getSheetSections(navItems).map((section) => ({
    id: section.group,
    title: SHEET_GROUP_TITLES[section.group] ?? section.group,
    items: section.items.map(toTile),
  }))

  const settingsItem: LinkNavItem | null = getSheetFooter(navItems)
  const sheetFooterItems: NavSheetTile[] = settingsItem
    ? [toTile(settingsItem), HELP_TILE]
    : [HELP_TILE]

  const roleLabel = user?.role ? ROLE_META[user.role].label : "Account"

  // The five tabs, shaped for the dock, which renders the bar itself so
  // there is one implementation of it for both shells. Destinations and
  // order are the config's, unchanged.
  const dockTabs: NavDockTab[] = bottomItems.map((item) => {
    if (item.kind === "create") {
      return {
        kind: "create" as const,
        id: item.id,
        label: "Create post",
        icon: "mdi:plus",
        onSelect: () => setPostModalOpen(true),
      }
    }
    if (item.kind === "profile") {
      return {
        kind: "profile" as const,
        id: item.id,
        label: item.label,
        // Straight to the real URL, like the tile and the desktop avatar —
        // the tab is a destination now, not the dock's open button.
        href: profileHref,
        // The config's /profile, so viewing anyone's profile lights the tab
        // up exactly as it did before.
        match: item.href,
        avatarUrl: user?.profile_photo,
        initials: user?.name?.slice(0, 2).toUpperCase() || "U",
      }
    }
    return {
      kind: "link" as const,
      id: item.id,
      label: item.label,
      href: item.href,
      icon: item.icon,
      iconActive: item.iconActive,
      badge: badgeCount(item.badge),
    }
  })

  // The More panel: destinations only. Switch account and Log out are one
  // click away in the avatar dropdown at the other end of the same cluster,
  // and having them in both places made the panel look like an account menu.
  const moreRows: MoreMenuRow[] = moreItems.map((item) => ({
    kind: "link",
    id: item.id,
    label: item.label,
    href: item.href,
    icon: item.icon,
    active: pathname.startsWith(item.href),
    disabled: item.disabled,
    comingSoon: item.comingSoon,
  }))

  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <LogoMark />

          <nav className={styles.topNavLinks} aria-label="Main navigation">
            {primaryItems.map((item) => {
              const isActive = pathname.startsWith(item.href)

              // Coming soon: present, so the roadmap is visible, but not a
              // link and not focusable — there is nowhere to go yet.
              if (item.disabled) {
                return (
                  <span
                    key={item.id}
                    className={`${styles.topNavLink} ${styles.topNavLinkDisabled}`}
                    aria-disabled="true"
                  >
                    <span className={styles.topNavLinkIcon} aria-hidden="true">
                      <Icon icon={item.icon} width={20} height={20} />
                    </span>
                    <span className={styles.topNavLinkLabel}>{item.label}</span>
                    {item.comingSoon && <span className={styles.topNavSoon}>Soon</span>}
                  </span>
                )
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`${styles.topNavLink} ${isActive ? styles.topNavLinkActive : ""}`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.topNavLinkIcon} aria-hidden="true">
                    <Icon icon={isActive ? item.iconActive : item.icon} width={20} height={20} />
                  </span>
                  <span className={styles.topNavLinkLabel}>{item.label}</span>
                </Link>
              )
            })}

            <button
              ref={moreBtnRef}
              type="button"
              className={`${styles.topNavLink} ${styles.topNavMoreBtn} ${moreOpen ? styles.topNavLinkActive : ""}`}
              onClick={() => setMoreOpen((isOpen) => !isOpen)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More"
            >
              <span className={styles.topNavLinkIcon} aria-hidden="true">
                <Icon icon="mdi:dots-horizontal" width={20} height={20} />
              </span>
              <span className={styles.topNavLinkLabel}>More</span>
            </button>
          </nav>

          <div className={styles.topNavRight}>
            <button
              className={styles.topNavCreateBtn}
              onClick={() => setPostModalOpen(true)}
              type="button"
              aria-label="Create post"
            >
              <Icon icon="mdi:plus" width={18} height={18} />
            </button>

            {/* Messages and Alerts are icons here rather than inline links, so
                the left of the bar holds only destinations. */}
            {rightItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const alertCount = badgeCount(item.badge)

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`${styles.topNavIconBtn} ${isActive ? styles.topNavIconBtnActive : ""}`}
                  aria-label={
                    alertCount > 0 ? `${item.label}, ${alertCount} unread` : item.label
                  }
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.topNavIconWrap} aria-hidden="true">
                    <Icon icon={isActive ? item.iconActive : item.icon} width={22} height={22} />
                    <NotifDot count={alertCount} />
                  </span>
                </Link>
              )
            })}

            <div className={styles.topNavAvatar}>
              <div className={styles.avatarBtn}>
                <Link
                  href={profileHref}
                  style={{ display: "flex", borderRadius: "50%" }}
                  aria-label="My Profile"
                >
                  <Avatar
                    src={user?.profile_photo}
                    initials={user?.name?.slice(0, 2).toUpperCase()}
                    size="sm"
                    online
                  />
                </Link>
                <button
                  onClick={() => setDropdownOpen((open) => !open)}
                  aria-haspopup="true"
                  aria-expanded={dropdownOpen}
                  aria-label="Account menu"
                  style={{
                    background: "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 4px",
                    cursor: "pointer",
                  }}
                >
                  <Icon
                    icon={dropdownOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                    width={16}
                    height={16}
                    className={styles.avatarChevron}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <AccountSwitcher
                mode="user"
                styles={styles}
                actorType={actorType}
                actorId={actorId}
                organizations={organizations}
                user={user}
                openDropdown={dropdownOpen}
                // The dropdown is the whole of this instance; the mobile
                // surface is MobileNavSheet now.
                openSheet={false}
                onCloseDropdown={() => setDropdownOpen(false)}
                onCloseSheet={() => setMobileSheetOpen(false)}
                onSwitchToUser={handleSwitchToUser}
                onSwitchToOrganization={handleSwitchToOrganization}
                onLogout={() => setLogoutAsk(true)}
                enableSheet={false}
              />
            </div>
          </div>
        </div>
      </header>

      <NavMoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        anchorRef={moreBtnRef}
        rows={moreRows}
        label="More navigation"
      />

      <header
        className={`${styles.mobileTopBar} ${isChatPage ? styles.mobileTopBarHidden : ""}`}
        role="banner"
        aria-label="Mobile header"
      >
        <LogoMark />
        <div className={styles.mobileTopActions}>
          {topBarItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const alertCount = badgeCount(item.badge)

            return (
              <Link
                key={item.id}
                href={item.href}
                className={styles.mobileIconBtn}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                {item.badge ? (
                  <span className={styles.mobileIconBadgeWrap}>
                    <Icon icon={isActive ? item.iconActive : item.icon} width={24} height={24} />
                    <NotifDot count={alertCount} />
                  </span>
                ) : (
                  <Icon icon={isActive ? item.iconActive : item.icon} width={24} height={24} />
                )}
              </Link>
            )
          })}
        </div>
      </header>

      {/* Mobile navigation: ONE dock holding the tab bar and the sheet it
          expands into. It owns account switching on mobile — the long-press
          switcher it replaced put it behind a gesture nobody found. */}
      <MobileNavSheet
        open={mobileSheetOpen}
        onOpen={() => setMobileSheetOpen(true)}
        onClose={() => setMobileSheetOpen(false)}
        tabs={dockTabs}
        sections={sheetSections}
        footerItems={sheetFooterItems}
        pathname={pathname}
        visible={!isChatPage}
        account={{
          name: user?.name || "You",
          avatarUrl: user?.profile_photo,
          initials: user?.name?.slice(0, 2).toUpperCase() || "U",
          roleLabel: `${roleLabel} · Switch account`,
        }}
        mode="user"
        actorType={actorType}
        actorId={actorId}
        organizations={organizations}
        user={user}
        onSwitchToUser={handleSwitchToUser}
        onSwitchToOrganization={handleSwitchToOrganization}
        onLogout={handleLogout}
      />

      <ConfirmDialog
        open={logoutAsk}
        {...LOGOUT_CONFIRM}
        tone="danger"
        onConfirm={() => {
          setLogoutAsk(false)
          handleLogout()
        }}
        onCancel={() => setLogoutAsk(false)}
      />

      {postModalOpen && postingProfile.username && (
        <CreatePostModal
          username={postingProfile.username}
          userAvatarUrl={postingProfile.avatarUrl || undefined}
          userInitials={postingProfile.initials}
          displayName={postingProfile.displayName}
          onClose={() => setPostModalOpen(false)}
        />
      )}
    </>
  )
}
