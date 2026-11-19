"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import {
  ORG_PERMISSIONS,
  hasOrgPermission,
  type OrgPermission,
} from "@/shared/permissions/orgPermissions"
import { useAuthStore } from "@/store/auth.store"
import { storeOrgFor } from "../../hooks/usePageOrg"
import { ENQUIRIES_FORBIDDEN_SENTENCE, PAGE_FORBIDDEN_SENTENCE } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import styles from "./RequirePagePermission.module.css"

/** Does this person hold `permission` at THAT org (never the active one by default)? */
export function useHasPagePermission(orgId: string, permission: OrgPermission): boolean {
  return useAuthStore((state) => hasOrgPermission(storeOrgFor(state, orgId), permission))
}

const DENIED: Partial<Record<OrgPermission, string>> = {
  [ORG_PERMISSIONS.PAGE_MANAGE]: PAGE_FORBIDDEN_SENTENCE,
  [ORG_PERMISSIONS.ENQUIRIES_MANAGE]: ENQUIRIES_FORBIDDEN_SENTENCE,
}

/**
 * The calm answer for someone without the permission: what it takes, and the way
 * back. Never a redirect, so there is nothing to loop.
 */
export function PagePermissionState({
  orgId,
  message = PAGE_FORBIDDEN_SENTENCE,
}: {
  orgId: string
  message?: string
}) {
  return (
    <div className={styles.page}>
      <div className={styles.state} role="status">
        <span className={styles.icon} aria-hidden="true">
          <Icon icon="mdi:lock-outline" width={28} height={28} />
        </span>
        <p className={styles.message}>{message}</p>
        <Button variant="outline" href={`${orgAdminBase(orgId)}/dashboard`}>
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}

/**
 * Renders `children` only for someone who holds `permission` at `orgId`, read from
 * that org's `my_permissions` in the store (never a role). A hint, like every
 * permission on the client: the server re-checks each call.
 */
export default function RequirePagePermission({
  orgId,
  permission,
  children,
}: {
  orgId: string
  permission: OrgPermission
  children: ReactNode
}) {
  const allowed = useHasPagePermission(orgId, permission)
  if (!allowed) return <PagePermissionState orgId={orgId} message={DENIED[permission]} />
  return <>{children}</>
}
