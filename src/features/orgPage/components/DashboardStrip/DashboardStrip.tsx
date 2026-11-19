"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { useEnquiryUnreadCount } from "@/features/enquiries/hooks/useEnquiries"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { usePageAdmin } from "../../hooks/useOrgPage"
import { orgAdminBase, pageBase } from "../../sectionMeta"
import { useHasPagePermission } from "../RequirePagePermission/RequirePagePermission"
import styles from "./DashboardStrip.module.css"

/**
 * The dashboard's top strip: how ready the page is (page.manage) and how many
 * enquiries are new (enquiries.manage). Each tile is there only with its
 * permission, and the strip only with one of them.
 */
export default function DashboardStrip({ orgId }: { orgId: string }) {
  const canEditPage = useHasPagePermission(orgId, ORG_PERMISSIONS.PAGE_MANAGE)
  const canHandleEnquiries = useHasPagePermission(orgId, ORG_PERMISSIONS.ENQUIRIES_MANAGE)
  // "" disables the read for someone who can't edit the page.
  const admin = usePageAdmin(canEditPage ? orgId : "")
  const unread = useEnquiryUnreadCount(orgId, { enabled: canHandleEnquiries })

  if (!canEditPage && !canHandleEnquiries) return null

  const percent = Math.max(0, Math.min(100, Math.round(admin.data?.readiness.percent ?? 0)))
  const next = admin.data?.readiness.next
  const fresh = unread.data?.new ?? 0

  return (
    <div className={styles.strip}>
      {canEditPage && (
        <Link href={pageBase(orgId)} className={styles.tile}>
          <span className={styles.tileHead}>
            <Icon icon="mdi:card-account-details-outline" width={18} height={18} aria-hidden="true" />
            Your page
          </span>
          {admin.isLoading ? (
            <span className={styles.skeleton} aria-hidden="true" />
          ) : (
            <>
              <span className={styles.percentRow}>
                <span className={styles.bigNumber}>{percent}%</span>
                <span className={styles.muted}>ready</span>
              </span>
              <span
                className={styles.bar}
                role="progressbar"
                aria-label="How ready your page is"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span className={styles.barFill} style={{ width: `${percent}%` }} />
              </span>
              <span className={styles.muted}>{next ? `Next: ${next.label}` : "Ready to share"}</span>
            </>
          )}
          <span className={styles.cta}>
            Open your page
            <Icon icon="mdi:chevron-right" width={18} height={18} aria-hidden="true" />
          </span>
        </Link>
      )}

      {canHandleEnquiries && (
        <Link href={`${orgAdminBase(orgId)}/enquiries`} className={styles.tile}>
          <span className={styles.tileHead}>
            <Icon icon="mdi:inbox-arrow-down-outline" width={18} height={18} aria-hidden="true" />
            Enquiries
          </span>
          {unread.isLoading ? (
            <span className={styles.skeleton} aria-hidden="true" />
          ) : fresh > 0 ? (
            <span className={styles.percentRow}>
              <span className={`${styles.bigNumber} ${styles.brandNumber}`}>{fresh}</span>
              <span className={styles.muted}>new</span>
            </span>
          ) : (
            <span className={styles.none}>No new enquiries</span>
          )}
          <span className={styles.cta}>
            Open inbox
            <Icon icon="mdi:chevron-right" width={18} height={18} aria-hidden="true" />
          </span>
        </Link>
      )}
    </div>
  )
}
