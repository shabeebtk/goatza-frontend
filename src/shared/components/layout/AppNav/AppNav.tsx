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
import { useLogout } from "@/features/auth/hooks/useLogout"
import { useQueryClient } from "@tanstack/react-query"
import AccountSwitcher from "@/shared/components/layout/AccountSwitcher/AccountSwitcher"
import { useUnreadCount } from "@/features/Notifications/hooks/useNotificationQueries"
import { useConversationsUnreadSummary } from "@/features/messages/hooks/useConversationQueries"
import { useScrollChrome } from "@/shared/hooks/useScrollChrome"
import {
  getBottomNav,
  getDesktopNav,
  getNavItems,
  getTopBarNav,
  type NavBadgeKey,
} from "@/config/navigation"

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
  useScrollChrome({ enabled: !isChatPage })

  // Nav is driven entirely by the role config — no role branching in JSX.
  const navItems = getNavItems(user?.role)
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

  const pressTimer = useRef<NodeJS.Timeout | null>(null)
  const wasLongPressed = useRef(false)

  const startPress = () => {
    wasLongPressed.current = false
    pressTimer.current = setTimeout(() => {
      wasLongPressed.current = true
      setMobileSheetOpen(true)
      if (window.navigator?.vibrate) window.navigator.vibrate(50)
    }, 450)
  }

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setMobileSheetOpen(false)
      } else {
        setDropdownOpen(false)
      }
    }

    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const handleLogout = useLogout()

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

  const desktopItems = getDesktopNav(navItems)
  const topBarItems = getTopBarNav(navItems)
  const bottomItems = getBottomNav(navItems)

  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <LogoMark />

          <nav className={styles.topNavLinks} aria-label="Main navigation">
            {desktopItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const alertCount = badgeCount(item.badge)

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`${styles.topNavLink} ${isActive ? styles.topNavLinkActive : ""}`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.topNavLinkIcon} aria-hidden="true">
                    <Icon icon={isActive ? item.iconActive : item.icon} width={22} height={22} />
                    {alertCount > 0 && <NotifDot count={alertCount} />}
                  </span>
                  <span className={styles.topNavLinkLabel}>{item.label}</span>
                </Link>
              )
            })}
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

            <div className={styles.topNavAvatar}>
              <div className={styles.avatarBtn}>
                <Link
                  href="/profile"
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
                openSheet={mobileSheetOpen}
                onCloseDropdown={() => setDropdownOpen(false)}
                onCloseSheet={() => setMobileSheetOpen(false)}
                onSwitchToUser={handleSwitchToUser}
                onSwitchToOrganization={handleSwitchToOrganization}
                onLogout={handleLogout}
                enableSheet={false}
              />
            </div>
          </div>
        </div>
      </header>

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

      <nav
        className={`${styles.bottomBar} ${isChatPage ? styles.bottomBarHidden : ""}`}
        aria-label="Tab navigation"
      >
        {bottomItems.map((item) => {
          if (item.kind === "create") {
            return (
              <button
                key={item.id}
                className={styles.bottomTabCreate}
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                aria-label="Create post"
                onClick={() => setPostModalOpen(true)}
              >
                <span className={styles.bottomTabCreateInner} aria-hidden="true">
                  <Icon icon="mdi:plus" width={28} height={28} />
                </span>
              </button>
            )
          }

          const isActive = pathname.startsWith(item.href)

          if (item.kind === "profile") {
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`${styles.bottomTab} ${isActive ? styles.bottomTabActive : ""}`}
                aria-label="Profile (Long press for account switcher)"
                aria-current={isActive ? "page" : undefined}
                onTouchStart={startPress}
                onTouchEnd={clearPress}
                onTouchMove={clearPress}
                onMouseDown={startPress}
                onMouseUp={clearPress}
                onMouseLeave={clearPress}
                onContextMenu={(event) => {
                  event.preventDefault()
                  wasLongPressed.current = true
                  setMobileSheetOpen(true)
                }}
                onClick={(event) => {
                  if (wasLongPressed.current) {
                    event.preventDefault()
                  }
                }}
              >
                {user ? (
                  <Avatar
                    src={user.profile_photo}
                    initials={user.name?.slice(0, 2).toUpperCase() || "U"}
                    size="xs"
                    className={isActive ? styles.bottomTabAvatar : ""}
                  />
                ) : (
                  <Icon icon="mdi:account-circle-outline" width={26} height={26} />
                )}
              </Link>
            )
          }

          // kind === "link"
          const alertCount = badgeCount(item.badge)

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.bottomTab} ${isActive ? styles.bottomTabActive : ""}`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {item.badge ? (
                <span className={styles.bottomTabIcon} aria-hidden="true">
                  <Icon icon={isActive ? item.iconActive : item.icon} width={26} height={26} />
                  <NotifDot count={alertCount} />
                </span>
              ) : (
                <Icon icon={isActive ? item.iconActive : item.icon} width={26} height={26} />
              )}
            </Link>
          )
        })}
      </nav>

      <AccountSwitcher
        mode="user"
        styles={styles}
        actorType={actorType}
        actorId={actorId}
        organizations={organizations}
        user={user}
        openDropdown={dropdownOpen}
        openSheet={mobileSheetOpen}
        onCloseDropdown={() => setDropdownOpen(false)}
        onCloseSheet={() => setMobileSheetOpen(false)}
        onSwitchToUser={handleSwitchToUser}
        onSwitchToOrganization={handleSwitchToOrganization}
        onLogout={handleLogout}
        enableDropdown={false}
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
