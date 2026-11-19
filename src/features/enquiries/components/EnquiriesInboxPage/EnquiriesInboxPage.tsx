"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import { pageShareUrl } from "@/features/orgPage/format"
import { usePageAdmin } from "@/features/orgPage/hooks/useOrgPage"
import { usePageOrg } from "@/features/orgPage/hooks/usePageOrg"
import { usePrograms } from "@/features/orgPage/hooks/usePrograms"
import PageEditorLayout from "@/features/orgPage/components/PageEditorLayout/PageEditorLayout"
import RequirePagePermission, {
  useHasPagePermission,
} from "@/features/orgPage/components/RequirePagePermission/RequirePagePermission"
import { useShareLink } from "@/features/squads/hooks/useShareLink"
import Button from "@/shared/components/ui/Button/Button"
import Select from "@/shared/components/ui/Select/Select"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { STATUS_LABELS } from "../../enquiryFormat"
import { useInbox, useUpdateEnquiry } from "../../hooks/useEnquiries"
import { ENQUIRY_STATUSES, type EnquiryStatus, type InboxItem } from "../../types"
import EnquiryCard from "./EnquiryCard"
import styles from "./EnquiriesInboxPage.module.css"

export function enquiriesBase(orgId: string) {
  return `/organization/admin/${orgId}/enquiries`
}

export default function EnquiriesInboxPage({ orgId, status }: { orgId: string; status: EnquiryStatus }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.ENQUIRIES_MANAGE}>
      <Inbox orgId={orgId} status={status} />
    </RequirePagePermission>
  )
}

function Inbox({ orgId, status: requested }: { orgId: string; status: EnquiryStatus }) {
  const router = useRouter()
  const toast = useToast()
  const org = usePageOrg(orgId)
  const orgName = org?.name ?? ""
  const canEditPage = useHasPagePermission(orgId, ORG_PERMISSIONS.PAGE_MANAGE)

  // The tab moves at once and the route follows (REPLACE); back / forward move it too.
  const [status, setStatus] = useState<EnquiryStatus>(requested)
  const [seen, setSeen] = useState(requested)
  if (seen !== requested) {
    setSeen(requested)
    setStatus(requested)
  }
  const [programId, setProgramId] = useState("")
  const [locationId, setLocationId] = useState("")

  const filters = { status, program_id: programId || undefined, location_id: locationId || undefined }
  const inbox = useInbox(orgId, filters)
  const update = useUpdateEnquiry(orgId)
  const admin = usePageAdmin(orgId)
  // Programs are read behind page.manage; without it the filter just isn't offered.
  const programs = usePrograms(canEditPage ? orgId : "")
  const detail = useOrgDetail(orgId)

  const items = useMemo(() => inbox.data?.pages.flatMap((page) => page.items) ?? [], [inbox.data])
  const counts = inbox.data?.pages[0]?.counts
  const formOff = admin.data?.settings.contact.enquiry_form_enabled === false

  const programOptions = [
    { value: "", label: "All programs" },
    ...(programs.data ?? []).map((program) => ({ value: program.id, label: program.name })),
  ]
  const locationOptions = [
    { value: "", label: "All branches" },
    ...(detail.data?.locations ?? []).map((location) => ({
      value: location.id,
      label: location.name || location.city || "Branch",
    })),
  ]

  const choose = (next: EnquiryStatus) => {
    if (next === status) return
    setStatus(next)
    router.replace(`${enquiriesBase(orgId)}${next === "new" ? "" : `?status=${next}`}`, { scroll: false })
  }

  const setRowStatus = (row: InboxItem, next: EnquiryStatus, undoable: boolean) =>
    update.mutate(
      { enquiryId: row.id, body: { status: next } },
      {
        onSuccess: () => {
          if (!undoable) return
          toast.show({
            title: "Marked contacted",
            variant: "success",
            position: "top-center",
            duration: 6000,
            action: { label: "Undo", onClick: () => setRowStatus({ ...row, status: next }, "new", false) },
          })
        },
        onError: () =>
          toast.show({
            title: "Couldn't change that",
            message: "Check your connection and try again.",
            variant: "error",
            position: "top-center",
          }),
      }
    )

  // The next page loads as the end of the list comes into view; "Load more" is
  // there for whatever can't observe.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = inbox
  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasNextPage || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: "400px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <PageEditorLayout
      orgId={orgId}
      title="Enquiries"
      back={{ fallback: `/organization/admin/${orgId}/dashboard`, label: "Back to dashboard" }}
    >
      <div className={styles.tabs} role="tablist" aria-label="Enquiries by status">
        {ENQUIRY_STATUSES.map((key) => {
          const chosen = key === status
          const count = counts?.[key]
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={chosen}
              className={`${styles.tab} ${chosen ? styles.tabChosen : ""}`}
              onClick={() => choose(key)}
            >
              {STATUS_LABELS[key]}
              {count !== undefined && (
                <span className={`${styles.count} ${key === "new" && count > 0 ? styles.countNew : ""}`}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {(programOptions.length > 2 || locationOptions.length > 2) && (
        <div className={styles.filters}>
          {programOptions.length > 2 && (
            <Select
              aria-label="Program"
              sheetTitle="Program"
              options={programOptions}
              value={programId}
              onChange={setProgramId}
            />
          )}
          {locationOptions.length > 2 && (
            <Select
              aria-label="Branch"
              sheetTitle="Branch"
              options={locationOptions}
              value={locationId}
              onChange={setLocationId}
            />
          )}
        </div>
      )}

      {formOff && (
        <div className={styles.notice} role="status">
          <Icon icon="mdi:clipboard-off-outline" width={20} height={20} aria-hidden="true" />
          <p>Your enquiry form is off. Nobody new can send one.</p>
          {canEditPage && (
            <Button variant="outline" href={`/organization/admin/${orgId}/page/contact`}>
              Turn it on
            </Button>
          )}
        </div>
      )}

      <div role="tabpanel" aria-label={STATUS_LABELS[status]}>
        {inbox.isLoading ? (
          <ul className={styles.list} aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className={styles.skeletonCard}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
                <span className={styles.skeletonLineShort} />
              </li>
            ))}
          </ul>
        ) : inbox.isError && !inbox.data ? (
          <div className={styles.state} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
            <p>Couldn&apos;t load your enquiries.</p>
            <Button variant="outline" loading={inbox.isRefetching} onClick={() => inbox.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyTab status={status} username={org?.username} orgName={orgName} />
        ) : (
          <>
            <ul className={styles.list}>
              {items.map((item) => (
                <EnquiryCard
                  key={item.id}
                  item={item}
                  href={`${enquiriesBase(orgId)}/${item.id}`}
                  orgName={orgName}
                  onMarkContacted={status === "new" ? () => setRowStatus(item, "contacted", true) : undefined}
                />
              ))}
            </ul>
            <div ref={sentinel} className={styles.sentinel} aria-hidden="true" />
            {hasNextPage && (
              <div className={styles.more}>
                <Button variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageEditorLayout>
  )
}

function EmptyTab({
  status,
  username,
  orgName,
}: {
  status: EnquiryStatus
  username?: string
  orgName: string
}) {
  const { share } = useShareLink()

  if (status !== "new") return <p className={styles.quiet}>Nothing here yet.</p>

  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <Icon icon="mdi:inbox-arrow-down-outline" width={28} height={28} />
      </span>
      <p>No new enquiries. Share your page to get more.</p>
      {username && (
        <Button
          variant="brand"
          leftIcon={<Icon icon="mdi:share-variant-outline" width={18} height={18} />}
          onClick={() =>
            void share({ title: orgName, text: `${orgName} on Goatza`, url: pageShareUrl(username) })
          }
        >
          Share
        </Button>
      )}
    </div>
  )
}
