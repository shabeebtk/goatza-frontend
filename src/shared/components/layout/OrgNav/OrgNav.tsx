"use client"

/**
 * GOATZA — OrgNav
 * Organization admin shell navigation.
 *
 * Desktop: fixed top bar with org logo, nav links, avatar dropdown
 * Mobile:  slim top bar + bottom tab bar with account sheet on avatar tap
 *
 * Nav items: Home · Discover · Messages · Members
 * Avatar dropdown/sheet: view org profile, switch back to personal account
 */

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./OrgNav.module.css"
import { LOGO_URL } from "@/constants"
import { useAuthStore } from "@/store/auth.store"
import { logoutApi } from "@/features/auth/services/auth.api"
import { useOrganizations } from "@/features/organization/hooks/useOrganizations"
import { useQueryClient } from "@tanstack/react-query"
// ── Helpers ────────────────────────────────────────────────────────
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

// ── Logo ───────────────────────────────────────────────────────────
function OrgLogoMark({
  orgId,
  logoUrl,
  orgName,
}: {
  orgId: string
  logoUrl?: string
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
          <span className={styles.logoInitials}>
            {orgName?.slice(0, 2).toUpperCase() ?? "OR"}
          </span>
        )}
      </div>
      <div className={styles.logoText}>
        <span className={styles.logoWordmark}>{orgName ?? "Organization"}</span>
        <span className={styles.logoBadge}>Admin</span>
      </div>
    </Link>
  )
}

// ── Notification dot ──────────────────────────────────────────────
function NotifDot({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className={styles.notifBadge} aria-label={`${count} notifications`}>
      {count > 9 ? "9+" : count}
    </span>
  )
}

// ── Shared account switcher content ───────────────────────────────
function AccountSwitcherContent({
  onClose,
  actorType,
  actorId,
  organizations,
  user,
  onSwitchToUser,
  onSwitchToOrganization,
  onLogout,
  orgId,
}: {
  onClose: () => void
  actorType: "user" | "organization"
  actorId: string | null
  organizations: any[]
  user: any
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
  orgId: string
}) {
  return (
    <>
      {/* Org identity link */}
      <Link
        href={`${orgBase(orgId)}/profile`}
        className={styles.dropdownHeader}
        onClick={onClose}
      >
        <div className={styles.orgAvatarWrap}>
          <Avatar
            src={organizations.find((o) => o.id === orgId)?.logo}
            initials={organizations.find((o) => o.id === orgId)?.name?.slice(0, 2).toUpperCase() ?? "OR"}
            size="md"
          />
          <span className={styles.orgBadgePip} aria-hidden="true">
            <Icon icon="mdi:office-building" width={10} height={10} />
          </span>
        </div>
        <div className={styles.dropdownUserInfo}>
          <span className={styles.dropdownName}>
            {organizations.find((o) => o.id === orgId)?.name ?? "Organization"}
          </span>
          <span className={styles.dropdownHandle}>View org profile →</span>
        </div>
      </Link>

      <div className={styles.dropdownDivider} />

      {/* Account switcher */}
      <p className={styles.dropdownSectionLabel}>Switch Account</p>

      {/* Personal */}
      <button
        className={`${styles.dropdownItem} ${actorType === "user" ? styles.dropdownItemActive : ""}`}
        onClick={() => { onSwitchToUser(); onClose() }}
      >
        <Avatar
          src={user?.profile_photo}
          initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
          size="xs"
        />
        <span className={styles.dropdownItemText}>
          <span>{user?.name}</span>
          <span className={styles.dropdownItemSub}>Personal account</span>
        </span>
        {actorType === "user" && (
          <span className={styles.dropdownItemCheck}>
            <Icon icon="mdi:check" width={14} height={14} />
          </span>
        )}
      </button>

      {/* Org accounts */}
      {organizations.map((org) => (
        <button
          key={org.id}
          className={`${styles.dropdownItem} ${actorType === "organization" && actorId === org.id ? styles.dropdownItemActive : ""}`}
          onClick={() => { onSwitchToOrganization(org.id); onClose() }}
        >
          <Avatar
            src={org.logo}
            initials={org.name?.slice(0, 2).toUpperCase()}
            size="xs"
          />
          <span className={styles.dropdownItemText}>
            <span>{org.name}</span>
            <span className={styles.dropdownItemSub}>Organization</span>
          </span>
          {actorType === "organization" && actorId === org.id && (
            <span className={styles.dropdownItemCheck}>
              <Icon icon="mdi:check" width={14} height={14} />
            </span>
          )}
        </button>
      ))}

      <div className={styles.dropdownDivider} />

      {/* Settings & Logout */}
      <Link href={`${orgBase(orgId)}/settings`} className={styles.dropdownItem} onClick={onClose}>
        <span className={styles.dropdownItemIcon}>
          <Icon icon="mdi:cog-outline" width={16} height={16} />
        </span>
        Org Settings
      </Link>
      <Link href="/settings" className={styles.dropdownItem} onClick={onClose}>
        <span className={styles.dropdownItemIcon}>
          <Icon icon="mdi:account-cog-outline" width={16} height={16} />
        </span>
        Personal Settings
      </Link>
      <button
        className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
        onClick={() => { onLogout(); onClose() }}
      >
        <span className={styles.dropdownItemIcon}>
          <Icon icon="mdi:logout" width={16} height={16} />
        </span>
        Logout
      </button>
    </>
  )
}

// ── Desktop Dropdown ───────────────────────────────────────────────
function OrgAccountDropdown({
  open,
  onClose,
  ...rest
}: {
  open: boolean
  onClose: () => void
  actorType: "user" | "organization"
  actorId: string | null
  organizations: any[]
  user: any
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
  orgId: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={ref} className={styles.dropdown} role="menu" aria-label="Organization account menu">
      <AccountSwitcherContent onClose={onClose} {...rest} />
    </div>
  )
}

// ── Mobile Bottom Sheet ────────────────────────────────────────────
function OrgMobileSheet({
  open,
  onClose,
  ...rest
}: {
  open: boolean
  onClose: () => void
  actorType: "user" | "organization"
  actorId: string | null
  organizations: any[]
  user: any
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
  orgId: string
}) {
  if (!open) return null

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Account switcher"
    >
      <div className={styles.sheetModal}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetHeader}>
          <div className={styles.sheetSpacer} />
          <h2 className={styles.sheetTitle}>Account</h2>
          <button className={styles.sheetCloseBtn} onClick={onClose} aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>
        <div className={styles.sheetContent}>
          <AccountSwitcherContent onClose={onClose} {...rest} />
        </div>
      </div>
    </div>
  )
}

// ── OrgNav ─────────────────────────────────────────────────────────
export default function OrgNav({ orgId }: { orgId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)
  const switchToUser = useAuthStore((s) => s.switchToUser)
  const switchToOrganization = useAuthStore((s) => s.switchToOrganization)

  const { data: organizations = [] } = useOrganizations()
  const currentOrg = organizations.find((o: any) => o.id === orgId)
  const queryClient = useQueryClient();

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const NAV_ITEMS = buildNavItems(orgId)

  const handleLogout = async () => {
    try { await logoutApi() } catch (_) {}
    clearAuth()
    queryClient.clear();
    router.push("/auth")
  }

  const handleSwitchToUser = () => {
    switchToUser()
    queryClient.clear();
    router.push("/home")
  }

  const handleSwitchToOrganization = (id: string) => {
    switchToOrganization(id)
    queryClient.clear();
    router.push(`/organization/admin/${id}/home`)
  }

  const sharedProps = {
    actorType,
    actorId,
    organizations,
    user,
    onSwitchToUser: handleSwitchToUser,
    onSwitchToOrganization: handleSwitchToOrganization,
    onLogout: handleLogout,
    orgId,
  }

  return (
    <>
      {/* ═══════════════════════════════════════
          DESKTOP TOP NAV  (≥ 768px)
          ═══════════════════════════════════════ */}
      <header className={styles.topNav} role="banner">
        {/* Org accent stripe */}

        <div className={styles.topNavInner}>
          {/* Left: org logo + name */}
          <OrgLogoMark
            orgId={orgId}
            logoUrl={currentOrg?.logo}
            orgName={currentOrg?.name}
          />

          {/* Center: nav links */}
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

          {/* Right: avatar + dropdown */}
          <div className={styles.topNavAvatar}>
            <div className={styles.avatarBtn}>
              <div className={styles.orgAvatarWrap}>
                <Avatar
                  src={currentOrg?.logo}
                  initials={currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR"}
                  size="sm"
                />
                <span className={styles.orgBadgePip} aria-hidden="true">
                  <Icon icon="mdi:office-building" width={10} height={10} />
                </span>
              </div>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
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

            <OrgAccountDropdown
              open={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              {...sharedProps}
            />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          MOBILE TOP BAR  (< 768px)
          ═══════════════════════════════════════ */}
      <header className={styles.mobileTopBar} role="banner" aria-label="Organization mobile header">
        <OrgLogoMark
          orgId={orgId}
          logoUrl={currentOrg?.logo}
          orgName={currentOrg?.name}
        />
        <div className={styles.mobileTopActions}>
          <Link href={`${orgBase(orgId)}/search`} className={styles.mobileIconBtn} aria-label="Search">
            <Icon icon="mdi:magnify" width={24} height={24} />
          </Link>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          MOBILE BOTTOM TAB BAR  (< 768px)
          ═══════════════════════════════════════ */}
      <nav className={styles.bottomBar} aria-label="Organization tab navigation">
        {NAV_ITEMS.map((item) => {
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

        {/* Avatar tab — opens account sheet */}
        <button
          className={`${styles.bottomTab} ${styles.bottomTabAvatarBtn}`}
          aria-label="Account switcher"
          onClick={() => setSheetOpen(true)}
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
        </button>
      </nav>

      {/* ── Mobile Account Sheet ── */}
      <OrgMobileSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        {...sharedProps}
      />
    </>
  )
}