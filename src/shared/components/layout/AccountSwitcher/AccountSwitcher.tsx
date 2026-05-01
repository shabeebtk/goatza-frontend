"use client"

import { useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { ActorType, OrganizationActor, User } from "@/store/auth.store"

type ClassMap = Record<string, string>

type AccountSwitcherMode = "user" | "organization"

interface AccountSwitcherProps {
  mode: AccountSwitcherMode
  styles: ClassMap
  actorType: ActorType
  actorId: string | null
  organizations: OrganizationActor[]
  user: User | null
  currentOrgId?: string
  openDropdown: boolean
  openSheet: boolean
  onCloseDropdown: () => void
  onCloseSheet: () => void
  onSwitchToUser: () => void
  onSwitchToOrganization: (id: string) => void
  onLogout: () => void
  enableDropdown?: boolean
  enableSheet?: boolean
}

function AccountSwitcherContent({
  mode,
  styles,
  actorType,
  actorId,
  organizations,
  user,
  currentOrgId,
  onClose,
  onSwitchToUser,
  onSwitchToOrganization,
  onLogout,
}: Omit<
  AccountSwitcherProps,
  "openDropdown" | "openSheet" | "onCloseDropdown" | "onCloseSheet"
> & { onClose: () => void }) {
  const currentOrg = useMemo(
    () =>
      currentOrgId
        ? organizations.find((organization) => organization.id === currentOrgId)
        : null,
    [currentOrgId, organizations]
  )

  return (
    <>
      {mode === "organization" && currentOrgId ? (
        <Link
          href={`/organization/admin/${currentOrgId}/profile`}
          className={styles.dropdownHeader}
          onClick={onClose}
        >
          <div className={styles.orgAvatarWrap}>
            <Avatar
              src={currentOrg?.logo}
              initials={currentOrg?.name?.slice(0, 2).toUpperCase() ?? "OR"}
              size="md"
            />
            <span className={styles.orgBadgePip} aria-hidden="true">
              <Icon icon="mdi:office-building" width={10} height={10} />
            </span>
          </div>
          <div className={styles.dropdownUserInfo}>
            <span className={styles.dropdownName}>
              {currentOrg?.name ?? "Organization"}
            </span>
            <span className={styles.dropdownHandle}>View org profile</span>
          </div>
        </Link>
      ) : (
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
      )}

      <div className={styles.dropdownDivider} />
      <p className={styles.dropdownSectionLabel}>Switch Account</p>

      <button
        className={`${styles.dropdownItem} ${actorType === "user" ? styles.dropdownItemActive : ""}`}
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
        <span className={styles.dropdownItemText}>
          <span>{user?.name ?? "Personal Account"}</span>
          <span className={styles.dropdownItemSub}>Personal account</span>
        </span>
        {actorType === "user" && (
          <span className={styles.dropdownItemCheck}>
            <Icon icon="mdi:check" width={14} height={14} />
          </span>
        )}
      </button>

      {organizations.map((organization) => (
        <button
          key={organization.id}
          className={`${styles.dropdownItem} ${actorType === "organization" && actorId === organization.id ? styles.dropdownItemActive : ""}`}
          onClick={() => {
            onSwitchToOrganization(organization.id)
            onClose()
          }}
        >
          <Avatar
            src={organization.logo}
            initials={organization.name?.slice(0, 2).toUpperCase()}
            size="xs"
          />
          <span className={styles.dropdownItemText}>
            <span>{organization.name}</span>
            <span className={styles.dropdownItemSub}>Organization</span>
          </span>
          {actorType === "organization" && actorId === organization.id && (
            <span className={styles.dropdownItemCheck}>
              <Icon icon="mdi:check" width={14} height={14} />
            </span>
          )}
        </button>
      ))}

      <div className={styles.dropdownDivider} />

      {mode === "organization" && currentOrgId ? (
        <>
          <Link
            href={`/organization/admin/${currentOrgId}/settings`}
            className={styles.dropdownItem}
            onClick={onClose}
          >
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
        </>
      ) : (
        <>
          <Link href="/settings" className={styles.dropdownItem} onClick={onClose}>
            <span className={styles.dropdownItemIcon}>
              <Icon icon="mdi:cog-outline" width={16} height={16} />
            </span>
            Settings
          </Link>
          <Link
            href="/organization/create"
            className={styles.dropdownItem}
            onClick={onClose}
          >
            <span className={styles.dropdownItemIcon}>
              <Icon icon="mdi:plus-circle-outline" width={16} height={16} />
            </span>
            Create Page
          </Link>
        </>
      )}

      <button
        className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
        onClick={() => {
          onLogout()
          onClose()
        }}
      >
        <span className={styles.dropdownItemIcon}>
          <Icon icon="mdi:logout" width={16} height={16} />
        </span>
        Logout
      </button>
    </>
  )
}

function AccountDropdownMenu({
  open,
  onClose,
  children,
  styles,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  styles: ClassMap
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={ref} className={styles.dropdown} role="menu" aria-label="Account menu">
      {children}
    </div>
  )
}

function AccountBottomSheet({
  open,
  onClose,
  children,
  styles,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  styles: ClassMap
}) {
  if (!open) return null

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
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
        <div className={styles.sheetContent}>{children}</div>
      </div>
    </div>
  )
}

export default function AccountSwitcher(props: AccountSwitcherProps) {
  return (
    <>
      {props.enableDropdown !== false && (
        <AccountDropdownMenu
          open={props.openDropdown}
          onClose={props.onCloseDropdown}
          styles={props.styles}
        >
          <AccountSwitcherContent {...props} onClose={props.onCloseDropdown} />
        </AccountDropdownMenu>
      )}

      {props.enableSheet !== false && (
        <AccountBottomSheet
          open={props.openSheet}
          onClose={props.onCloseSheet}
          styles={props.styles}
        >
          <AccountSwitcherContent {...props} onClose={props.onCloseSheet} />
        </AccountBottomSheet>
      )}
    </>
  )
}
