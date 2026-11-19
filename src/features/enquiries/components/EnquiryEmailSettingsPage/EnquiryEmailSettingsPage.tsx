"use client"

/**
 * Settings → Notifications: the person's enquiry emails, one switch per org whose
 * enquiries they handle. Every call here is made as the PERSON (enquiries.api.ts).
 * The emails' "turn these off" link lands on ?org=<id>, which brings that org's row
 * into view and rings it for two seconds.
 */

import { useEffect, useMemo, useState } from "react"
import { isAxiosError } from "axios"

import PageSwitch from "@/features/orgPage/components/PageSwitch/PageSwitch"
import type { OrganizationMini } from "@/features/organization/types"
import { BackHeader } from "@/shared/components/ui"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { ORG_PERMISSIONS, hasOrgPermission } from "@/shared/permissions/orgPermissions"
import { useAuthStore } from "@/store/auth.store"
import { useEnquiryAlerts, useUpdateEnquiryAlerts } from "../../hooks/useEnquiries"
import styles from "./EnquiryEmailSettingsPage.module.css"

const HIGHLIGHT_MS = 2000

const rowId = (orgId: string) => `enquiry-emails-${orgId}`

export default function EnquiryEmailSettingsPage() {
  const organizations = useAuthStore((state) => state.organizations)
  // Filtered outside the selector: a new array from a selector re-renders forever.
  const orgs = useMemo(
    () => organizations.filter((org) => hasOrgPermission(org, ORG_PERMISSIONS.ENQUIRIES_MANAGE)),
    [organizations]
  )
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // ?org=<id>, read once on arrival. From window rather than useSearchParams:
  // this route renders statically and would otherwise need a Suspense boundary.
  const orgIds = orgs.map((org) => org.id).join(",")
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("org")
    if (!target || !orgIds.split(",").includes(target)) return

    const row = document.getElementById(rowId(target))
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    row?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
    // Read from the URL once, after mount: there is nothing to derive in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightId(target)
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [orgIds])

  return (
    <div className={styles.page}>
      <BackHeader title="Notifications" fallback="/settings" />

      <section className={styles.section} aria-labelledby="enquiry-emails-title">
        <h2 id="enquiry-emails-title" className={styles.sectionTitle}>
          Enquiry emails
        </h2>
        <p className={styles.intro}>
          We email you when someone sends an enquiry. At most one email every 30 minutes; more are
          grouped into one. You still see every enquiry in the app.
        </p>

        {orgs.length ? (
          <ul className={styles.rows}>
            {orgs.map((org) => (
              <OrgEmailRow key={org.id} org={org} highlighted={highlightId === org.id} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>You don&apos;t handle enquiries for any page.</p>
        )}
      </section>
    </div>
  )
}

/** One org: its own read, its own skeleton, an optimistic switch. */
function OrgEmailRow({ org, highlighted }: { org: OrganizationMini; highlighted: boolean }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useEnquiryAlerts(org.id)
  const update = useUpdateEnquiryAlerts(org.id)
  const lostAccess = isError && isAxiosError(error) && error.response?.status === 404

  let control = null
  if (isLoading) {
    control = <span className={styles.skeletonSwitch} aria-hidden="true" />
  } else if (data) {
    control = (
      <span className={styles.switchWrap}>
        <span className={styles.switchLabel} aria-hidden="true">
          Email me
        </span>
        <PageSwitch
          label={`Email me about enquiries to ${org.name}`}
          checked={data.email}
          busy={update.isPending}
          onChange={(next) => update.mutate(next)}
        />
      </span>
    )
  } else if (!lostAccess) {
    control = (
      <button
        type="button"
        className={styles.retry}
        onClick={() => refetch()}
        disabled={isRefetching}
      >
        Try again
      </button>
    )
  }

  return (
    <li id={rowId(org.id)} className={`${styles.row} ${highlighted ? styles.highlighted : ""}`}>
      <Avatar src={org.logo || undefined} initials={org.name?.slice(0, 2).toUpperCase() || "OR"} size="sm" />
      <span className={styles.rowText}>
        <span className={styles.name}>{org.name}</span>
        {lostAccess ? (
          <span className={styles.note}>You no longer handle this page&apos;s enquiries.</span>
        ) : isError && !data ? (
          <span className={styles.note}>Couldn&apos;t load this setting.</span>
        ) : null}
      </span>
      {control}
    </li>
  )
}
