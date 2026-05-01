"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./OrgNav.module.css"
import { useAuthStore } from "@/store/auth.store"
import { logoutApi } from "@/features/auth/services/auth.api"
import { useQueryClient } from "@tanstack/react-query"
import AccountSwitcher from "@/shared/components/layout/AccountSwitcher/AccountSwitcher"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"

function orgBase(orgId: string) {
  return `/organization/admin/${orgId}`
}

function buildNavItems(orgId: string) {
  const base = orgBase(orgId)
  return [
    {
      href: `${base}/home`,
      icon: "mdi:home-outline",
      iconActive: "mdi:home",
      label: "Home",
    },
    {
      href: `${base}/discover`,
      icon: "mdi:compass-outline",
      iconActive: "mdi:compass",
      label: "Discover",
    },
    {
      href: `${base}/messages`,
      icon: "mdi:message-outline",
      iconActive: "mdi:message",
      label: "Messages",
    },
    {
      href: `${base}/members`,
      icon: "mdi:account-group-outline",
      iconActive: "mdi:account-group",
      label: "Members",
    },
  ]
}

function OrgLogoMark({
  orgId,
  logoUrl,
  orgName,
}: {
  orgId: string
  logoUrl?: string | null
  orgName?: string
}) {
  return (
    <Link
      href={`${orgBase(orgId)}/home`}
      aria-label={`${orgName ?? "Organization"} home`}
      className={styles.logoLink}
    >
      <div className={styles.logoImgWrap}>
        {logoUrl ? (
          <img src={logoUrl} alt="" aria-hidden="true" className={styles.logoImg} />
        ) : (
          <span className={styles.logoInitials}>{orgName?.slice(0, 2).toUpperCase() ?? "OR"}</span>
        )}
      </div>
      <div className={styles.logoText}>
        <span className={styles.logoWordmark}>{orgName ?? "Organization"}</span>
        <span className={styles.logoBadge}>Admin</span>
      </div>
    </Link>
  )
}

export default function OrgNav({ orgId }: { orgId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)

  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const actorType = useAuthStore((state) => state.actorType)
  const actorId = useAuthStore((state) => state.actorId)
  const switchToUser = useAuthStore((state) => state.switchToUser)
  const switchToOrganization = useAuthStore((state) => state.switchToOrganization)
  const organizations = useAuthStore((state) => state.organizations)
  const activeOrganization = useAuthStore((state) => state.currentOrganization)

  const currentOrg =
    activeOrganization?.id === orgId
      ? activeOrganization
      : organizations.find((organization) => organization.id === orgId)

  const NAV_ITEMS = buildNavItems(orgId)
  const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.label !== "Members")
  const MOBILE_LEFT_ITEMS = MOBILE_NAV_ITEMS.slice(0, 2)
  const MOBILE_RIGHT_ITEMS = MOBILE_NAV_ITEMS.slice(2)

  const pressTimer = useRef<NodeJS.Timeout | null>(null)
  const wasLongPressed = useRef(false)

  const startPress = () => {
    wasLongPressed.current = false
    pressTimer.current = setTimeout(() => {
      wasLongPressed.current = true
      setSheetOpen(true)
      if (window.navigator?.vibrate) window.navigator.vibrate(50)
    }, 450)
  }

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setSheetOpen(false)
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
    setSheetOpen(false)
    queryClient.clear()
    router.push("/home")
  }

  const handleSwitchToOrganization = (organizationId: string) => {
    switchToOrganization(organizationId)
    setDropdownOpen(false)
    setSheetOpen(false)
    queryClient.clear()
    router.push(`/organization/admin/${organizationId}/home`)
  }

  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <OrgLogoMark orgId={orgId} logoUrl={currentOrg?.logo} orgName={currentOrg?.name} />

          <nav className={styles.topNavLinks} aria-label="Organization navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.topNavLink} ${isActive ? styles.topNavLinkActive : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                >
                  <span className={styles.topNavLinkIcon} aria-hidden="true">
                    <Icon icon={isActive ? item.iconActive : item.icon} width={22} height={22} />
                  </span>
                  <span className={styles.topNavLinkLabel}>{item.label}</span>
                </Link>
              )
            })}
          </nav>

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
                href={`${orgBase(orgId)}/profile`}
                className={styles.orgAvatarWrap}
                aria-label="Organization profile"
              >
                <Avatar
                  src={currentOrg?.logo}
                  initials={currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR"}
                  size="sm"
                />
                <span className={styles.orgBadgePip} aria-hidden="true">
                  <Icon icon="mdi:office-building" width={10} height={10} />
                </span>
              </Link>
              <button
                onClick={() => setDropdownOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                aria-label="Account menu"
                className={styles.chevronBtn}
              >
                <Icon
                  icon={dropdownOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                  width={16}
                  height={16}
                  className={styles.avatarChevron}
                />
              </button>
            </div>

            <AccountSwitcher
              mode="organization"
              styles={styles}
              actorType={actorType}
              actorId={actorId}
              organizations={organizations}
              user={user}
              currentOrgId={orgId}
              openDropdown={dropdownOpen}
              openSheet={sheetOpen}
              onCloseDropdown={() => setDropdownOpen(false)}
              onCloseSheet={() => setSheetOpen(false)}
              onSwitchToUser={handleSwitchToUser}
              onSwitchToOrganization={handleSwitchToOrganization}
              onLogout={handleLogout}
              enableSheet={false}
            />
          </div>
        </div>
      </header>

      <header className={styles.mobileTopBar} role="banner" aria-label="Organization mobile header">
        <OrgLogoMark orgId={orgId} logoUrl={currentOrg?.logo} orgName={currentOrg?.name} />
        <div className={styles.mobileTopActions}>
          <Link href={`${orgBase(orgId)}/search`} className={styles.mobileIconBtn} aria-label="Search">
            <Icon icon="mdi:magnify" width={24} height={24} />
          </Link>
        </div>
      </header>

      <nav className={styles.bottomBar} aria-label="Organization tab navigation">
        {MOBILE_LEFT_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomTab} ${isActive ? styles.bottomTabActive : ""}`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={styles.bottomTabIcon}>
                <Icon icon={isActive ? item.iconActive : item.icon} width={26} height={26} />
              </span>
            </Link>
          )
        })}

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

        {MOBILE_RIGHT_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomTab} ${isActive ? styles.bottomTabActive : ""}`}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={styles.bottomTabIcon}>
                <Icon icon={isActive ? item.iconActive : item.icon} width={26} height={26} />
              </span>
            </Link>
          )
        })}

        <Link
          href={`${orgBase(orgId)}/profile`}
          className={`${styles.bottomTab} ${pathname.startsWith(`${orgBase(orgId)}/profile`) ? styles.bottomTabActive : ""}`}
          aria-label="Organization profile (Long press for account switcher)"
          aria-current={pathname.startsWith(`${orgBase(orgId)}/profile`) ? "page" : undefined}
          onTouchStart={startPress}
          onTouchEnd={clearPress}
          onTouchMove={clearPress}
          onMouseDown={startPress}
          onMouseUp={clearPress}
          onMouseLeave={clearPress}
          onContextMenu={(event) => {
            event.preventDefault()
            wasLongPressed.current = true
            setSheetOpen(true)
          }}
          onClick={(event) => {
            if (wasLongPressed.current) {
              event.preventDefault()
            }
          }}
        >
          <div className={styles.orgAvatarWrap}>
            <Avatar
              src={currentOrg?.logo}
              initials={currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR"}
              size="xs"
              className={actorType === "organization" ? styles.bottomTabAvatarActive : ""}
            />
            <span className={styles.orgBadgePipSm} aria-hidden="true">
              <Icon icon="mdi:office-building" width={8} height={8} />
            </span>
          </div>
        </Link>
      </nav>

      <AccountSwitcher
        mode="organization"
        styles={styles}
        actorType={actorType}
        actorId={actorId}
        organizations={organizations}
        user={user}
        currentOrgId={orgId}
        openDropdown={dropdownOpen}
        openSheet={sheetOpen}
        onCloseDropdown={() => setDropdownOpen(false)}
        onCloseSheet={() => setSheetOpen(false)}
        onSwitchToUser={handleSwitchToUser}
        onSwitchToOrganization={handleSwitchToOrganization}
        onLogout={handleLogout}
        enableDropdown={false}
      />

      {postModalOpen && currentOrg?.username && (
        <CreatePostModal
          username={currentOrg.username}
          userAvatarUrl={currentOrg.logo || undefined}
          userInitials={currentOrg.name?.slice(0, 2).toUpperCase() || "OR"}
          displayName={currentOrg.name}
          onClose={() => setPostModalOpen(false)}
        />
      )}
    </>
  )
}
