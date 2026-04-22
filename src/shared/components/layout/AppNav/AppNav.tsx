"use client";

/**
 * GOATZA — AppNav
 * Desktop: full top bar with search, nav links, avatar dropdown
 * Mobile:  slim top bar + bottom tab bar (icons only)
 *
 * Usage: wrap in AppShell (ProtectedLayout), content goes in <main>
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import Avatar from "@/shared/components/ui/Avatar/Avatar";
import Badge from "@/shared/components/ui/Badge/Badge";
import styles from "./AppNav.module.css";
import { LOGO_URL } from "@/constants";
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"
import { useAuthStore } from "@/store/auth.store";
import { Button } from "../../ui";
import { logoutApi } from "@/features/auth/services/auth.api";
import { useOrganizations } from "@/features/organization/hooks/useOrganizations";

// ── Static mock data (replace with real auth/org context) ─────────
const MOCK_USER = {
  name: "Arjun Menon",
  handle: "@arjun.m",
  avatarUrl: "", // set to real URL or leave empty for initials
  initials: "AM",
  notifCount: 4,
  messageCount: 2,
};


// ── Nav items (desktop + mobile bottom bar) ────────────────────────
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
];

// ── Logo ───────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <Link href="/home" aria-label="Goatza home" className={styles.logoLink}>
      <div className={styles.logoImgWrap}>
        <img
          src={LOGO_URL}
          alt=""
          aria-hidden="true"
          className={styles.logoImg}
        />
      </div>
      <span className={styles.logoWordmark}>Goatza</span>
    </Link>
  );
}

// ── Search bar ────────────────────────────────────────────────────
function SearchBar({ compact = false }: { compact?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={`${styles.searchWrap} ${compact ? styles.searchCompact : ""} ${focused ? styles.searchFocused : ""}`}
    >
      <span className={styles.searchIcon} aria-hidden="true">
        <Icon icon="mdi:magnify" width={18} height={18} />
      </span>
      <input
        type="search"
        placeholder="Search athletes, teams, sports…"
        className={styles.searchInput}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search"
      />
      {focused && (
        <kbd className={styles.searchKbd} aria-hidden="true">
          ⌘K
        </kbd>
      )}
    </div>
  );
}

// ── Notification badge ────────────────────────────────────────────
function NotifDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className={styles.notifBadge} aria-label={`${count} notifications`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ── Account dropdown ──────────────────────────────────────────────
function AccountDropdown({
  open,
  onClose,
  actorType,
  actorId,
  organizations,
  onSwitchToUser,
  onSwitchToOrganization,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  actorType: "user" | "organization"
  actorId: string | null
  organizations: any[]
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
}) {
  const user = useAuthStore((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={styles.dropdown}
      role="menu"
      aria-label="Account menu"
    >
      {/* User identity */}
      <Link
        href="/profile"
        className={styles.dropdownHeader}
        onClick={onClose}
        style={{ textDecoration: "none" }}
      >
        <Avatar
          src={user?.profile_photo}
          initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
          size="md"
          online
        />
        <div className={styles.dropdownUserInfo}>
          <span className={styles.dropdownName}>{user?.name}</span>
          <span className={styles.dropdownHandle}>@{user?.username}</span>
        </div>
      </Link>

      <div className={styles.dropdownDivider} />

      {/* Account switcher */}
      <p className={styles.dropdownSectionLabel}>Account</p>

      <button
        className={`${styles.dropdownItem} ${actorType === "user" ? styles.dropdownItemActive : ""
          }`}
        onClick={() => {
          onSwitchToUser()
          onClose()
        }}
      >
        <Avatar
          src={user?.profile_photo}
          initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
          size="xs"
        />

        Personal Account

        {actorType === "user" && (
          <span className={styles.dropdownItemCheck}>
            <Icon icon="mdi:check" width={14} height={14} />
          </span>
        )}
      </button>

      {organizations.map((org) => (
        <button
          key={org.id}
          className={`${styles.dropdownItem} ${actorType === "organization" && actorId === org.id
            ? styles.dropdownItemActive
            : ""
            }`}
          onClick={() => {
            onSwitchToOrganization(org.id)
            onClose()
          }}
        >
          <Avatar
            src={org.logo}
            initials={org.name?.slice(0, 2).toUpperCase()}
            size="xs"
          />

          {org.name}

          {actorType === "organization" && actorId === org.id && (
            <span className={styles.dropdownItemCheck}>
              <Icon icon="mdi:check" width={14} height={14} />
            </span>
          )}
        </button>
      ))}

      <div className={styles.dropdownDivider} />

      {/* Links */}
      <Link
        href="/settings"
        className={styles.dropdownItem}
        role="menuitem"
        onClick={onClose}
      >
        <span className={styles.dropdownItemIcon} aria-hidden="true">
          <Icon icon="mdi:cog-outline" width={16} height={16} />
        </span>
        Settings
      </Link>

      <div className={styles.dropdownDivider} />
      <Link
        href="/organization/create"
        className={styles.dropdownItem}
        role="menuitem"
        onClick={onClose}
      >
        <span className={styles.dropdownItemIcon} aria-hidden="true">
          <Icon icon="mdi:plus-circle-outline" width={16} height={16} />
        </span>
        Create Page
      </Link>



      <button
        className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
        role="menuitem"
        onClick={() => {
          onLogout();
          onClose();
        }}
      >
        <span className={styles.dropdownItemIcon} aria-hidden="true">
          <Icon icon="mdi:logout" width={16} height={16} />
        </span>
        Logout
      </button>
    </div>
  );
}

// ── Mobile Account Sheet ───────────────────────────────────────────
function MobileAccountSheet({
  open,
  onClose,
  actorType,
  actorId,
  organizations,
  onSwitchToUser,
  onSwitchToOrganization,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  actorType: "user" | "organization"
  actorId: string | null
  organizations: any[]
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
}) {
  const user = useAuthStore((s) => s.user);

  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.sheetBackdrop} onClick={handleBackdrop} role="dialog" aria-modal="true">
      <div className={styles.sheetModal}>
        <div className={styles.sheetHeader}>
          <div className={styles.sheetSpacer} />
          <h2 className={styles.sheetTitle}>ACCOUNT</h2>
          <button className={styles.sheetCloseBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <div className={styles.sheetContent}>
          {/* User identity */}
          <Link
            href="/profile"
            className={styles.dropdownHeader}
            onClick={onClose}
            style={{ textDecoration: "none" }}
          >
            <Avatar
              src={user?.profile_photo}
              initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
              size="md"
              online
            />
            <div className={styles.dropdownUserInfo}>
              <span className={styles.dropdownName}>{user?.name}</span>
              <span className={styles.dropdownHandle}>@{user?.username}</span>
            </div>
          </Link>

          <div className={styles.dropdownDivider} />

          {/* Account switcher */}
          <p className={styles.dropdownSectionLabel}>Account</p>
          <button
            className={`${styles.dropdownItem} ${actorType === "user" ? styles.dropdownItemActive : ""
              }`}
            onClick={() => {
              onSwitchToUser()
              onClose()
            }}
          >
            <Avatar
              src={user?.profile_photo}
              initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
              size="xs"
            />

            Personal Account

            {actorType === "user" && (
              <span className={styles.dropdownItemCheck}>
                <Icon icon="mdi:check" width={14} height={14} />
              </span>
            )}
          </button>

          {organizations.map((org) => (
            <button
              key={org.id}
              className={`${styles.dropdownItem} ${actorType === "organization" && actorId === org.id
                ? styles.dropdownItemActive
                : ""
                }`}
              onClick={() => {
                onSwitchToOrganization(org.id)
                onClose()
              }}
            >
              <Avatar
                src={org.logo}
                initials={org.name?.slice(0, 2).toUpperCase()}
                size="xs"
              />

              {org.name}

              {actorType === "organization" && actorId === org.id && (
                <span className={styles.dropdownItemCheck}>
                  <Icon icon="mdi:check" width={14} height={14} />
                </span>
              )}
            </button>
          ))}

          <div className={styles.dropdownDivider} />

          {/* Links */}
          <Link
            href="/settings"
            className={styles.dropdownItem}
            role="menuitem"
            onClick={onClose}
          >
            <span className={styles.dropdownItemIcon} aria-hidden="true">
              <Icon icon="mdi:cog-outline" width={16} height={16} />
            </span>
            Settings
          </Link>
          <button
            className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
            role="menuitem"
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <span className={styles.dropdownItemIcon} aria-hidden="true">
              <Icon icon="mdi:logout" width={16} height={16} />
            </span>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AppNav ────────────────────────────────────────────────────────
export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const isChatPage = /^\/messages\/.+/.test(pathname)

  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  const switchToUser = useAuthStore((s) => s.switchToUser)
  const switchToOrganization = useAuthStore(
    (s) => s.switchToOrganization
  )

  const { data: organizations = [] } = useOrganizations()

  // ── Long Press Logic ──────────────────────────────────────────────────
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const wasLongPressed = useRef(false);

  const startPress = () => {
    wasLongPressed.current = false;
    pressTimer.current = setTimeout(() => {
      wasLongPressed.current = true;
      setMobileSheetOpen(true);
      if (window.navigator?.vibrate) window.navigator.vibrate(50);
    }, 450); // trigger sheet after 450ms
  };

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  // ──────────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) { }
    clearAuth();
    router.push("/auth");
  };

  const handleSwitchToUser = () => {
    switchToUser()
    setDropdownOpen(false)
    setMobileSheetOpen(false)
    router.push("/home")
  }

  const handleSwitchToOrganization = (orgId: string) => {
    switchToOrganization(orgId)
    setDropdownOpen(false)
    setMobileSheetOpen(false)
    router.push(`/organization/admin/${orgId}/home`)
  }

  return (
    <>
      {/* ════════════════════════════════════════════
          DESKTOP TOP NAV  (≥ 768px)
          ════════════════════════════════════════════ */}
      <header className={styles.topNav} role="banner">
        <div className={styles.topNavInner}>
          {/* Left: logo */}
          <LogoMark />

          {/* Center: search */}
          <div className={styles.topNavCenter}>
            <SearchBar />
          </div>

          {/* Right: nav links + avatar */}
          <nav className={styles.topNavLinks} aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const hasAlert =
                item.href === "/messages"
                  ? MOCK_USER.messageCount > 0
                  : item.href === "/notifications"
                    ? MOCK_USER.notifCount > 0
                    : false;
              const alertCount =
                item.href === "/messages"
                  ? MOCK_USER.messageCount
                  : item.href === "/notifications"
                    ? MOCK_USER.notifCount
                    : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.topNavLink} ${isActive ? styles.topNavLinkActive : ""}`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.topNavLinkIcon} aria-hidden="true">
                    <Icon
                      icon={isActive ? item.iconActive : item.icon}
                      width={22}
                      height={22}
                    />
                    {hasAlert && <NotifDot count={alertCount} />}
                  </span>
                  <span className={styles.topNavLinkLabel}>{item.label}</span>
                </Link>
              );
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

          {/* Avatar + dropdown */}
          <div className={styles.topNavAvatar}>
            <div ref={avatarRef} className={styles.avatarBtn}>
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
                onClick={() => setDropdownOpen((o) => !o)}
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

            <AccountDropdown
              open={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              actorType={actorType}
              actorId={actorId}
              organizations={organizations}
              onSwitchToUser={handleSwitchToUser}
              onSwitchToOrganization={handleSwitchToOrganization}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════
          MOBILE TOP BAR  (< 768px)
          ══════════{`${styles.mobileTopBar} ${isChatPage ? styles.mobileTopBarHidden : ""}`}═════════════ */}
      <header
        className={styles.mobileTopBar}
        role="banner"
        aria-label="Mobile header"
      >
        <LogoMark />

        <div className={styles.mobileTopActions}>
          {/* Search icon → opens search bar (simple toggle for now) */}
          <Link
            href="/search"
            className={styles.mobileIconBtn}
            aria-label="Search"
          >
            <Icon icon="mdi:magnify" width={24} height={24} />
          </Link>

          {/* Notifications */}
          <Link
            href="/notifications"
            className={`${styles.mobileIconBtn} ${styles.mobileIconBtnRelative}`}
            aria-label="Notifications"
          >
            <Icon
              icon={
                pathname.startsWith("/notifications")
                  ? "mdi:bell"
                  : "mdi:bell-outline"
              }
              width={24}
              height={24}
            />
            <NotifDot count={MOCK_USER.notifCount} />
          </Link>
        </div>
      </header>

      {/* ════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR  (< 768px)
         {`${styles.bottomBar} ${isChatPage ? styles.bottomBarHidden : ""}`}═══════════════════════════ */}
      <nav className={styles.bottomBar} aria-label="Tab navigation">
        {/* Home */}
        <Link
          href="/home"
          className={`${styles.bottomTab} ${pathname.startsWith("/home") ? styles.bottomTabActive : ""}`}
          aria-label="Home"
          aria-current={pathname.startsWith("/home") ? "page" : undefined}
        >
          <Icon
            icon={
              pathname.startsWith("/home") ? "mdi:home" : "mdi:home-outline"
            }
            width={26}
            height={26}
          />
        </Link>

        {/* Explore */}
        <Link
          href="/explore"
          className={`${styles.bottomTab} ${pathname.startsWith("/explore") ? styles.bottomTabActive : ""}`}
          aria-label="Explore"
          aria-current={pathname.startsWith("/explore") ? "page" : undefined}
        >
          <Icon
            icon={
              pathname.startsWith("/explore")
                ? "mdi:compass"
                : "mdi:compass-outline"
            }
            width={26}
            height={26}
          />
        </Link>

        {/* Create post — center CTA */}
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

        {/* Messages */}
        <Link
          href="/messages"
          className={`${styles.bottomTab} ${pathname.startsWith("/messages") ? styles.bottomTabActive : ""}`}
          aria-label="Messages"
          aria-current={pathname.startsWith("/messages") ? "page" : undefined}
        >
          <span className={styles.bottomTabIcon} aria-hidden="true">
            <Icon
              icon={
                pathname.startsWith("/messages")
                  ? "mdi:message"
                  : "mdi:message-outline"
              }
              width={26}
              height={26}
            />
            <NotifDot count={MOCK_USER.messageCount} />
          </span>
        </Link>


        {/* Profile */}
        <Link
          href="/profile"
          className={`${styles.bottomTab} ${pathname.startsWith("/profile") ? styles.bottomTabActive : ""}`}
          aria-label="Profile (Long press for settings)"
          aria-current={pathname.startsWith("/profile") ? "page" : undefined}
          onTouchStart={startPress}
          onTouchEnd={clearPress}
          onTouchMove={clearPress}
          onMouseDown={startPress}
          onMouseUp={clearPress}
          onMouseLeave={clearPress}
          onContextMenu={(e) => {
            e.preventDefault();
            wasLongPressed.current = true;
            setMobileSheetOpen(true);
          }}
          onClick={(e) => {
            if (wasLongPressed.current) {
              e.preventDefault();
            }
          }}
        >
          {user ? (
            <Avatar
              src={user?.profile_photo}
              initials={user?.name?.slice(0, 2).toUpperCase() || "U"}
              size="xs"
              className={pathname.startsWith("/profile") ? styles.bottomTabAvatar : ""}
            />
          ) : (
            <Icon icon="mdi:account-circle-outline" width={26} height={26} />
          )}
        </Link>
      </nav>

      {/* ── Mobile Account Bottom Sheet ── */}
      <MobileAccountSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        actorType={actorType}
        actorId={actorId}
        organizations={organizations}
        onSwitchToUser={handleSwitchToUser}
        onSwitchToOrganization={handleSwitchToOrganization}
        onLogout={handleLogout}
      />



      {postModalOpen && user && (
        <CreatePostModal
          username={user.username}
          userAvatarUrl={user.profile_photo}
          userInitials={user.name?.slice(0, 2).toUpperCase()}
          onClose={() => setPostModalOpen(false)}
        />
      )}

    </>
  );
}
