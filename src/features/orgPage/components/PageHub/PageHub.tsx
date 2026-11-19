"use client"

import { useRef, type ReactNode } from "react"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { orgNoun, publicPagePath } from "../../format"
import { usePageAdmin } from "../../hooks/useOrgPage"
import { usePageOrg } from "../../hooks/usePageOrg"
import { pageErrorCode } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import RequirePagePermission, {
  PagePermissionState,
} from "../RequirePagePermission/RequirePagePermission"
import ContactCard from "./ContactCard"
import ReadinessCard from "./ReadinessCard"
import SectionsCard from "./SectionsCard"
import ShareCard from "./ShareCard"
import styles from "./PageHub.module.css"

/**
 * "Your page": how ready the org's page is and what to do next, how people reach
 * the club, which sections show, and the link to share. Every editor starts here.
 */
export default function PageHub({ orgId }: { orgId: string }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <PageHubContent orgId={orgId} />
    </RequirePagePermission>
  )
}

function PageHubContent({ orgId }: { orgId: string }) {
  const org = usePageOrg(orgId)
  const { data, isLoading, isError, error, refetch, isRefetching } = usePageAdmin(orgId)
  const shareRef = useRef<HTMLElement | null>(null)

  const frame = (children: ReactNode) => (
    <PageEditorLayout
      orgId={orgId}
      title="Your page"
      back={{ fallback: `${orgAdminBase(orgId)}/dashboard`, label: "Back to dashboard" }}
      action={
        org?.username ? (
          <Button
            variant="outline"
            href={publicPagePath(org.username)}
            leftIcon={<Icon icon="mdi:eye-outline" width={18} height={18} />}
          >
            Preview
          </Button>
        ) : null
      }
    >
      {children}
    </PageEditorLayout>
  )

  if (isLoading) return frame(<HubSkeleton />)

  if (!data) {
    if (isError && pageErrorCode(error) === "forbidden") return <PagePermissionState orgId={orgId} />
    return frame(
      <div className={styles.state} role="alert">
        <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
        <p>Couldn&apos;t load your page.</p>
        <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  // The store said yes and the server says no: the server wins.
  if (!data.can_edit) return <PagePermissionState orgId={orgId} />

  const scrollToShare = () => {
    const target = shareRef.current
    if (!target) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    target.focus({ preventScroll: true })
  }

  return frame(
    <>
      <ReadinessCard
        orgId={orgId}
        noun={orgNoun(org?.type)}
        readiness={data.readiness}
        onShare={scrollToShare}
      />
      <ContactCard orgId={orgId} contact={data.settings.contact} />
      <SectionsCard
        orgId={orgId}
        orgType={org?.type}
        sections={data.sections}
        canEdit={data.can_edit}
      />
      <ShareCard
        ref={shareRef}
        orgId={orgId}
        username={org?.username}
        orgName={org?.name ?? "Our page"}
        poster={{
          logoUrl: org?.logo,
          ageMin: data.settings.facts.age_min,
          ageMax: data.settings.facts.age_max,
          enquiryFormOn: data.settings.contact.enquiry_form_enabled,
        }}
      />
    </>
  )
}

/** The hub's shape while it loads, so nothing jumps when it arrives. */
function HubSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonReadiness}>
        <span className={styles.skeletonHeadline} />
        <span className={styles.skeletonBar} />
        <span className={styles.skeletonLineDark} />
        <span className={styles.skeletonButtonDark} />
      </div>
      <div className={styles.skeletonCard}>
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonChips}>
          <span className={styles.skeletonChip} />
          <span className={styles.skeletonChip} />
          <span className={styles.skeletonChip} />
          <span className={styles.skeletonChip} />
        </span>
      </div>
      <div className={styles.skeletonCard}>
        <span className={styles.skeletonLine} />
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} className={styles.skeletonRow}>
            <span className={styles.skeletonTile} />
            <span className={styles.skeletonRowText}>
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineShort} />
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
