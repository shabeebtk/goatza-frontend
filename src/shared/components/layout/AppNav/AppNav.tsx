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
import { logoutApi } from "@/features/auth/services/auth.api"
import { useQueryClient } from "@tanstack/react-query"
import AccountSwitcher from "@/shared/components/layout/AccountSwitcher/AccountSwitcher"

const MOCK_USER = {
  notifCount: 4,
  messageCount: 2,
}

const NAV_ITEMS = [
  {
    href: "/home",
    icon: "mdi:home-outline",
    iconActive: "mdi:home",
    label: "Home",
  },
  {
    href: "/explore",
    icon: "mdi:compass-outline",
    iconActive: "mdi:compass",
    label: "Explore",
  },
  {
    href: "/recruitments",
    icon: "mdi:briefcase-search-outline",
    iconActive: "mdi:briefcase-search",
    label: "Recruitments",
  },
  {
    href: "/messages",
    icon: "mdi:message-outline",
    iconActive: "mdi:message",
    label: "Messages",
  },
  {
    href: "/notifications",
    icon: "mdi:bell-outline",
    iconActive: "mdi:bell",
    label: "Alerts",
  },
]

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

export default function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)

  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const actorType = useAuthStore((state) => state.actorType)
  const actorId = useAuthStore((state) => state.actorId)
  const organizations = useAuthStore((state) => state.organizations)
  const activeOrganization = useAuthStore((state) => state.currentOrganization)
  const switchToUser = useAuthStore((state) => state.switchToUser)
  const switchToOrganization = useAuthStore((state) => state.switchToOrganization)

  const isChatPage = /^\/messages\/.+/.test(pathname)

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

  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {}
    clearAuth()
    queryClient.clear()
    router.push("/auth")
  }

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
    router.push(`/organization/admin/${organizationId}/home`)
  }

  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <LogoMark />

          <nav className={styles.topNavLinks} aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const hasAlert =
                item.href === "/messages"
                  ? MOCK_USER.messageCount > 0
                  : item.href === "/notifications"
                    ? MOCK_USER.notifCount > 0
                    : false
              const alertCount =
                item.href === "/messages"
                  ? MOCK_USER.messageCount
                  : item.href === "/notifications"
                    ? MOCK_USER.notifCount
                    : 0

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.topNavLink} ${isActive ? styles.topNavLinkActive : ""}`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.topNavLinkIcon} aria-hidden="true">
                    <Icon icon={isActive ? item.iconActive : item.icon} width={22} height={22} />
                    {hasAlert && <NotifDot count={alertCount} />}
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
          <Link href="/explore" className={styles.mobileIconBtn} aria-label="Explore">
            <Icon
              icon={pathname.startsWith("/explore") ? "mdi:compass" : "mdi:compass-outline"}
              width={24}
              height={24}
            />
          </Link>
          <Link
            href="/notifications"
            className={`${styles.mobileIconBtn} ${styles.mobileIconBtnRelative}`}
            aria-label="Notifications"
          >
            <Icon
              icon={pathname.startsWith("/notifications") ? "mdi:bell" : "mdi:bell-outline"}
              width={24}
              height={24}
            />
            <NotifDot count={MOCK_USER.notifCount} />
          </Link>
        </div>
      </header>

      <nav
        className={`${styles.bottomBar} ${isChatPage ? styles.bottomBarHidden : ""}`}
        aria-label="Tab navigation"
      >
        <Link
          href="/home"
          className={`${styles.bottomTab} ${pathname.startsWith("/home") ? styles.bottomTabActive : ""}`}
          aria-label="Home"
          aria-current={pathname.startsWith("/home") ? "page" : undefined}
        >
          <Icon icon={pathname.startsWith("/home") ? "mdi:home" : "mdi:home-outline"} width={26} height={26} />
        </Link>

        <Link
          href="/recruitments"
          className={`${styles.bottomTab} ${pathname.startsWith("/recruitments") ? styles.bottomTabActive : ""}`}
          aria-label="Recruitments"
          aria-current={pathname.startsWith("/recruitments") ? "page" : undefined}
        >
          <Icon
            icon={pathname.startsWith("/recruitments") ? "mdi:briefcase-search" : "mdi:briefcase-search-outline"}
            width={26}
            height={26}
          />
        </Link>

        <button
          className={styles.bottomTabCreate}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-label="Create post"
          onClick={() => setPostModalOpen(true)}
        >
          <span className={styles.bottomTabCreateInner} aria-hidden="true">
            <Icon icon="mdi:plus" width={28} height={28} />
          </span>
        </button>

        <Link
          href="/messages"
          className={`${styles.bottomTab} ${pathname.startsWith("/messages") ? styles.bottomTabActive : ""}`}
          aria-label="Messages"
          aria-current={pathname.startsWith("/messages") ? "page" : undefined}
        >
          <span className={styles.bottomTabIcon} aria-hidden="true">
            <Icon
              icon={pathname.startsWith("/messages") ? "mdi:message" : "mdi:message-outline"}
              width={26}
              height={26}
            />
            <NotifDot count={MOCK_USER.messageCount} />
          </span>
        </Link>

        <Link
          href="/profile"
          className={`${styles.bottomTab} ${pathname.startsWith("/profile") ? styles.bottomTabActive : ""}`}
          aria-label="Profile (Long press for account switcher)"
          aria-current={pathname.startsWith("/profile") ? "page" : undefined}
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
              className={pathname.startsWith("/profile") ? styles.bottomTabAvatar : ""}
            />
          ) : (
            <Icon icon="mdi:account-circle-outline" width={26} height={26} />
          )}
        </Link>
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
