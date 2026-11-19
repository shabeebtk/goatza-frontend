"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { usePageAdmin } from "../../hooks/useOrgPage"
import { pageErrorCode } from "../../pageErrors"
import type { PageAdmin } from "../../types"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import RequirePagePermission, {
  PagePermissionState,
} from "../RequirePagePermission/RequirePagePermission"
import styles from "./PageAdminGate.module.css"

/**
 * What every settings editor does before its form: page.manage from the store,
 * then the hub's payload (settings and `can_edit`), with a skeleton in the
 * editor's own frame while it loads and Try again if it can't.
 */
export default function PageAdminGate({
  orgId,
  title,
  skeletonBlocks = [176, 176, 176],
  children,
}: {
  orgId: string
  title: string
  /** Heights of the skeleton's blocks, so the form arrives without a jump. */
  skeletonBlocks?: number[]
  children: (admin: PageAdmin) => ReactNode
}) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <AdminLoader orgId={orgId} title={title} skeletonBlocks={skeletonBlocks}>
        {children}
      </AdminLoader>
    </RequirePagePermission>
  )
}

function AdminLoader({
  orgId,
  title,
  skeletonBlocks,
  children,
}: {
  orgId: string
  title: string
  skeletonBlocks: number[]
  children: (admin: PageAdmin) => ReactNode
}) {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePageAdmin(orgId)

  if (isLoading) {
    return (
      <PageEditorLayout orgId={orgId} title={title}>
        <div className={styles.skeleton} aria-hidden="true">
          {skeletonBlocks.map((height, index) => (
            <span key={index} className={styles.skeletonBlock} style={{ height }} />
          ))}
        </div>
      </PageEditorLayout>
    )
  }

  if (!data) {
    if (isError && pageErrorCode(error) === "forbidden") return <PagePermissionState orgId={orgId} />
    return (
      <PageEditorLayout orgId={orgId} title={title}>
        <div className={styles.state} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
          <p>Couldn&apos;t load your page&apos;s settings.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </PageEditorLayout>
    )
  }

  if (!data.can_edit) return <PagePermissionState orgId={orgId} />

  return <>{children(data)}</>
}
