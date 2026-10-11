"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./OrgNav.module.css"
import { useAuthStore } from "@/store/auth.store"
import { useLogout } from "@/features/auth/hooks/useLogout"
import { useQueryClient } from "@tanstack/react-query"
import AccountSwitcher from "@/shared/components/layout/AccountSwitcher/AccountSwitcher"
import CreateMenu, { type CreateAction } from "@/shared/components/layout/CreateMenu/CreateMenu"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"
import CreateRecruitmentTrigger from "@/features/recruitments/components/CreateRecruitmentModal/CreateRecruitmentTrigger"
import { useUnreadCount } from "@/features/Notifications/hooks/useNotificationQueries"
import { useConversationsUnreadSummary } from "@/features/messages/hooks/useConversationQueries"
import { useScrollChrome } from "@/shared/hooks/useScrollChrome"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import MobileNavSheet, {
  type NavDockTab,
  type NavSheetGroup,
  type NavSheetTile,
} from "@/shared/components/layout/MobileNavSheet/MobileNavSheet"
import NavMoreMenu, { type MoreMenuRow } from "@/shared/components/layout/NavMoreMenu/NavMoreMenu"

function orgBase(orgId: string) {
  return `/organization/admin/${orgId}`
}

function buildNavItems(orgId: string) {
  const base = orgBase(orgId)
  return [
    {
      href: `${base}/dashboard`,
      icon: "mdi:view-dashboard-outline",
      iconActive: "mdi:view-dashboard",
      label: "Dashboard",
    },
    {
      href: `${base}/feed`,
      icon: "mdi:newspaper-variant-outline",
      iconActive: "mdi:newspaper-variant",
      label: "Feed",
    },
    {
      href: `${base}/explore`,
      icon: "mdi:compass-outline",
      iconActive: "mdi:compass",
      label: "Explore",
    },
    {
      href: `${base}/verifications`,
      icon: "mdi:shield-check-outline",
      iconActive: "mdi:shield-check",
      label: "Verify",
    },
    // Saved posts and Mentions are deliberately NOT here — they live behind
    // the gear on the org's own profile (OrgSettingsPage), the same place a
    // person finds theirs. The nav is for where an admin works daily.
    {
      href: `${base}/messages`,
      icon: "mdi:message-outline",
      iconActive: "mdi:message",
      label: "Messages",
    },
    {
      href: `${base}/notifications`,
      icon: "mdi:bell-outline",
      iconActive: "mdi:bell",
      label: "Alerts",
    },
  ]
}


/**
 * The expand sheet's destinations for an org admin. OrgNav's own nav is built
 * inline (buildNavItems above) and is a flat list of six, so the sheet gets
 * its own grouping rather than a filter of that: "Manage" is the work an admin
 * does on the org, "Grow" is where they go looking outward. The same
 * MobileNavSheet renders it — only the data differs from the user app.
 */
function buildSheetSections(
  orgId: string,
  { orgUsername }: { orgUsername?: string | null }
): NavSheetGroup[] {
  const base = orgBase(orgId)

  return [
    {
      id: "manage",
      title: "Manage",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          href: `${base}/dashboard`,
          icon: "mdi:view-dashboard-outline",
          iconActive: "mdi:view-dashboard",
        },
        {
          id: "feed",
          label: "Feed",
          href: `${base}/feed`,
          icon: "mdi:newspaper-variant-outline",
          iconActive: "mdi:newspaper-variant",
        },
        {
          id: "recruitments",
          label: "Recruitments",
          href: `${base}/recruitments`,
          icon: "mdi:briefcase-search-outline",
          iconActive: "mdi:briefcase-search",
        },
        {
          id: "verifications",
          label: "Verify",
          href: `${base}/verifications`,
          icon: "mdi:shield-check-outline",
          iconActive: "mdi:shield-check",
        },
      ],
    },
    {
      id: "grow",
      title: "Grow",
      items: [
        {
          id: "explore",
          label: "Explore",
          href: `${base}/explore`,
          icon: "mdi:compass-outline",
          iconActive: "mdi:compass",
        },
        {
          id: "tournaments",
          label: "Tournaments",
          icon: "mdi:trophy-outline",
          iconActive: "mdi:trophy",
          disabled: true,
          comingSoon: true,
        },
        {
          // The org's followers/following list — its network page. It needs
          // the handle, so it waits (dimmed) until the session has it.
          id: "members",
          label: "Members",
          href: orgUsername ? `${base}/profile/org/${orgUsername}/network` : undefined,
          icon: "mdi:account-group-outline",
          iconActive: "mdi:account-group",
          disabled: !orgUsername,
        },
        {
          id: "org_profile",
          label: "Org profile",
          href: `${base}/profile`,
          icon: "mdi:office-building-outline",
          iconActive: "mdi:office-building",
        },
      ],
    },
  ]
}

/**
 * The desktop bar's primary destinations. Deliberately NOT buildNavItems:
 * that list still drives the mobile bars (and must keep doing so), while the
 * desktop bar now shows only the four places an admin works and sends the
 * rest to the More panel.
 */
function buildDesktopPrimary(orgId: string) {
  const base = orgBase(orgId)
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      href: `${base}/dashboard`,
      icon: "mdi:view-dashboard-outline",
      iconActive: "mdi:view-dashboard",
    },
    {
      id: "feed",
      label: "Feed",
      href: `${base}/feed`,
      icon: "mdi:newspaper-variant-outline",
      iconActive: "mdi:newspaper-variant",
    },
    {
      id: "recruitments",
      label: "Recruitments",
      href: `${base}/recruitments`,
      icon: "mdi:briefcase-search-outline",
      iconActive: "mdi:briefcase-search",
    },
    {
      id: "verifications",
      label: "Verify",
      href: `${base}/verifications`,
      icon: "mdi:shield-check-outline",
      iconActive: "mdi:shield-check",
    },
  ]
}

/**
 * The sheet's footer row for an org: the two destinations that are not tiles,
 * plus Log out, which the sheet appends itself.
 */
function buildSheetFooter(orgId: string, unreadMessages: number): NavSheetTile[] {
  const base = orgBase(orgId)
  return [
    {
      id: "messages",
      label: "Messages",
      href: `${base}/messages`,
      icon: "mdi:message-outline",
      iconActive: "mdi:message",
      badge: unreadMessages,
    },
    {
      id: "settings",
      label: "Settings",
      href: `${base}/settings`,
      icon: "mdi:cog-outline",
      iconActive: "mdi:cog",
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
      href={`${orgBase(orgId)}/feed`}
      aria-label={`${orgName ?? "Organization"} feed`}
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

function NotifDot({ count }: { count: number }) {
  if (!count) return null

  return (
    <span className={styles.notifBadge} aria-label={`${count} notifications`}>
      {count > 9 ? "9+" : count}
    </span>
  )
}

export default function OrgNav({ orgId }: { orgId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Scroll-linked auto-hide for the mobile chrome (same feel as the user app).
  // Disabled on org chat conversation pages, where ChatWindow takes over the
  // screen. Drives `--chrome-progress` on <html> — no re-renders on scroll.
  const isChatPage = /\/organization\/admin\/[^/]+\/messages\/.+/.test(pathname)

  // The toasts offset themselves by the mobile bars only while a bar is
  // there to offset by — ChatWindow covers both on a chat page.
  useHtmlFlag("top-bar", !isChatPage)
  useHtmlFlag("bottom-bar", !isChatPage)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [postModalOpen, setPostModalOpen] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [recruitmentOpen, setRecruitmentOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)

  // Not while the sheet is open: the bar is the floor the sheet stands on.
  // Disabled also forces the chrome fully visible, which is what is wanted.
  useScrollChrome({ enabled: !isChatPage && !sheetOpen })

  const user = useAuthStore((state) => state.user)
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

  // Live badge counts for the acting organization (actor headers scope these).
  const notifCount = useUnreadCount().data?.count ?? 0
  const messageCount = useConversationsUnreadSummary().data?.total ?? 0

  // Data-driven create actions — add a new entry here to grow the "+" menu.
  const createActions: CreateAction[] = [
    {
      id: "post",
      label: "Create post",
      sublabel: "Share an update",
      icon: "mdi:image-plus-outline",
      onSelect: () => setPostModalOpen(true),
    },
    {
      id: "recruitment",
      label: "Create recruitment",
      sublabel: "Post a trial or search",
      icon: "mdi:bullhorn-outline",
      onSelect: () => setRecruitmentOpen(true),
    },
  ]

  const NAV_ITEMS = buildNavItems(orgId)
  const DESKTOP_PRIMARY = buildDesktopPrimary(orgId)
  const DESKTOP_RIGHT = [
    {
      id: "messages",
      label: "Messages",
      href: `${orgBase(orgId)}/messages`,
      icon: "mdi:message-outline",
      iconActive: "mdi:message",
    },
    {
      id: "notifications",
      label: "Alerts",
      href: `${orgBase(orgId)}/notifications`,
      icon: "mdi:bell-outline",
      iconActive: "mdi:bell",
    },
  ]
  // Mobile bottom bar shows Dashboard + Feed (left), Create, Messages (right),
  // then the profile avatar. Explore, Verify and Alerts live in the mobile top
  // bar instead — five bottom tabs is already the comfortable maximum, so a
  // new nav item joins the top bar rather than the bottom one.
  const MOBILE_TOP_BAR_LABELS = ["Alerts", "Explore", "Verify"]
  const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(
    (item) => !MOBILE_TOP_BAR_LABELS.includes(item.label)
  )
  const MOBILE_LEFT_ITEMS = MOBILE_NAV_ITEMS.slice(0, 2)
  const MOBILE_RIGHT_ITEMS = MOBILE_NAV_ITEMS.slice(2)

  // The same five tabs as before — Dashboard, Feed, Create, Messages, then
  // the org avatar — now shaped for the dock, which renders the bar itself.
  const dockTabs: NavDockTab[] = [
    ...MOBILE_LEFT_ITEMS.map((item) => ({
      kind: "link" as const,
      id: item.href,
      label: item.label,
      href: item.href,
      icon: item.icon,
      iconActive: item.iconActive,
    })),
    {
      kind: "create" as const,
      id: "create",
      label: "Open create menu",
      icon: "mdi:plus",
      onSelect: () => setCreateMenuOpen(true),
    },
    ...MOBILE_RIGHT_ITEMS.map((item) => ({
      kind: "link" as const,
      id: item.href,
      label: item.label,
      href: item.href,
      icon: item.icon,
      iconActive: item.iconActive,
      badge: item.label === "Messages" ? messageCount : undefined,
    })),
    {
      kind: "profile" as const,
      id: "org_profile_tab",
      label: "Organization profile",
      match: `${orgBase(orgId)}/profile`,
      avatarUrl: currentOrg?.logo,
      initials: currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR",
      isOrganization: true,
    },
  ]

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setSheetOpen(false)
        setCreateMenuOpen(false) // close the mobile create sheet
      } else {
        setDropdownOpen(false)
        setCreateMenuOpen(false) // close the desktop create dropdown
        setMoreOpen(false) // portalled, so it would outlive the desktop bar
      }
    }

    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // One logout path for the whole app (the user nav uses the same hook);
  // AccountSwitcher closes its own dropdown / sheet after calling it.
  const handleLogout = useLogout()

  const handleSwitchToUser = () => {
    switchToUser()
    setDropdownOpen(false)
    setSheetOpen(false)
    queryClient.clear()
    router.push("/home")
  }

  // The More panel: destinations only, matching the user app. Switch to
  // personal and Log out are in the avatar dropdown beside it rather than in
  // both places. Explore is here rather than in the primary four — it is
  // where an admin goes looking outward, not where the daily work is.
  // Members lives UNDER /profile, so the longest match wins — otherwise both
  // rows light up at once on the members page.
  const membersHref = currentOrg?.username
    ? `${orgBase(orgId)}/profile/org/${currentOrg.username}/network`
    : null
  const membersActive = !!membersHref && pathname.startsWith(membersHref)

  const moreRows: MoreMenuRow[] = [
    {
      kind: "link",
      id: "members",
      label: "Members",
      // Needs the org's handle; dimmed until the session has it.
      href: membersHref ?? `${orgBase(orgId)}/profile`,
      icon: "mdi:account-group-outline",
      active: membersActive,
      disabled: !membersHref,
    },
    {
      kind: "link",
      id: "org_profile",
      label: "Org profile",
      href: `${orgBase(orgId)}/profile`,
      icon: "mdi:office-building-outline",
      active: pathname.startsWith(`${orgBase(orgId)}/profile`) && !membersActive,
    },
    {
      kind: "link",
      id: "explore",
      label: "Explore",
      href: `${orgBase(orgId)}/explore`,
      icon: "mdi:compass-outline",
      active: pathname.startsWith(`${orgBase(orgId)}/explore`),
    },
    {
      kind: "link",
      id: "settings",
      label: "Settings",
      href: `${orgBase(orgId)}/settings`,
      icon: "mdi:cog-outline",
      active: pathname.startsWith(`${orgBase(orgId)}/settings`),
    },
    {
      kind: "link",
      id: "tournaments",
      label: "Tournaments",
      href: "/tournaments",
      icon: "mdi:trophy-outline",
      disabled: true,
      comingSoon: true,
    },
  ]

  const handleSwitchToOrganization = (organizationId: string) => {
    switchToOrganization(organizationId)
    setDropdownOpen(false)
    setSheetOpen(false)
    queryClient.clear()
    router.push(`/organization/admin/${organizationId}/dashboard`)
  }

  return (
    <>
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          <OrgLogoMark orgId={orgId} logoUrl={currentOrg?.logo} orgName={currentOrg?.name} />

          <nav className={styles.topNavLinks} aria-label="Organization navigation">
            {DESKTOP_PRIMARY.map((item) => {
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
            <div className={styles.createBtnWrap}>
              <button
                className={styles.topNavCreateBtn}
                onClick={() => setCreateMenuOpen((open) => !open)}
                onMouseDown={(event) => event.stopPropagation()}
                type="button"
                aria-label="Create a post or a recruitment"
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
              >
                <Icon icon="mdi:plus" width={18} height={18} />
                <span className={styles.createBtnLabel}>Post / Recruit</span>
              </button>
              <CreateMenu
                open={createMenuOpen}
                onClose={() => setCreateMenuOpen(false)}
                actions={createActions}
              />
            </div>

            {/* Messages and Alerts live here as icons now, not inline links. */}
            {DESKTOP_RIGHT.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const alertCount = item.id === "messages" ? messageCount : notifCount

              return (
                <Link
                  key={item.href}
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
                // Dropdown only; the mobile surface is MobileNavSheet now.
                openSheet={false}
                onCloseDropdown={() => setDropdownOpen(false)}
                onCloseSheet={() => setSheetOpen(false)}
                onSwitchToUser={handleSwitchToUser}
                onSwitchToOrganization={handleSwitchToOrganization}
                onLogout={handleLogout}
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
        label="More organization navigation"
      />

      <header className={styles.mobileTopBar} role="banner" aria-label="Organization mobile header">
        <OrgLogoMark orgId={orgId} logoUrl={currentOrg?.logo} orgName={currentOrg?.name} />
        <div className={styles.mobileTopActions}>
          <Link href={`${orgBase(orgId)}/explore`} className={styles.mobileIconBtn} aria-label="Explore">
            <Icon
              icon={pathname.startsWith(`${orgBase(orgId)}/explore`) ? "mdi:compass" : "mdi:compass-outline"}
              width={24}
              height={24}
            />
          </Link>
          <Link
            href={`${orgBase(orgId)}/verifications`}
            className={styles.mobileIconBtn}
            aria-label="Career verifications"
          >
            <Icon
              icon={
                pathname.startsWith(`${orgBase(orgId)}/verifications`)
                  ? "mdi:shield-check"
                  : "mdi:shield-check-outline"
              }
              width={24}
              height={24}
            />
          </Link>
          <Link
            href={`${orgBase(orgId)}/notifications`}
            className={styles.mobileIconBtn}
            aria-label="Notifications"
          >
            <span className={styles.mobileIconBadgeWrap}>
              <Icon
                icon={pathname.startsWith(`${orgBase(orgId)}/notifications`) ? "mdi:bell" : "mdi:bell-outline"}
                width={24}
                height={24}
              />
              <NotifDot count={notifCount} />
            </span>
          </Link>
        </div>
      </header>

      {/* Mobile navigation for the admin shell — the same component the user
          app uses, fed the org's own grouped structure. */}
      <MobileNavSheet
        open={sheetOpen}
        onOpen={() => setSheetOpen(true)}
        onClose={() => setSheetOpen(false)}
        tabs={dockTabs}
        sections={buildSheetSections(orgId, { orgUsername: currentOrg?.username })}
        footerItems={buildSheetFooter(orgId, messageCount)}
        pathname={pathname}
        visible={!isChatPage}
        account={{
          name: currentOrg?.name ?? "Organization",
          avatarUrl: currentOrg?.logo,
          initials: currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR",
          roleLabel: "Admin · Switch account",
          isOrganization: true,
        }}
        mode="organization"
        actorType={actorType}
        actorId={actorId}
        organizations={organizations}
        user={user}
        onSwitchToUser={handleSwitchToUser}
        onSwitchToOrganization={handleSwitchToOrganization}
        onLogout={handleLogout}
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

      {/* Recruitment modal — controlled by the create menu. CreateRecruitmentTrigger
          keeps its org-actor guard, so it self-renders null for non-org actors. */}
      <CreateRecruitmentTrigger
        open={recruitmentOpen}
        onOpenChange={setRecruitmentOpen}
        onCreated={() => router.push(`${orgBase(orgId)}/recruitments`)}
      />
    </>
  )
}
