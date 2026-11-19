"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"

import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import Select from "@/shared/components/ui/Select/Select"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { countLabel, formatBranch } from "../../format"
import { useFacilities, useSaveLocationFacilities } from "../../hooks/useFacilities"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import { orgAdminBase, pageBase } from "../../sectionMeta"
import type { FacilityCatalogGroup, LocationFacilities, PageFacilities } from "../../types"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import { FieldError } from "../PageFields/PageFields"
import RequirePagePermission from "../RequirePagePermission/RequirePagePermission"
import CustomFacilities from "./CustomFacilities"
import FacilityPhotos from "./FacilityPhotos"
import styles from "./FacilitiesPage.module.css"

const TITLE = "Facilities"
const FORM_ID = "page-facilities-form"

export type FacilityDraft = { items: string[]; custom_items: string[] }

const draftOf = (branch: LocationFacilities): FacilityDraft => ({
  items: [...branch.items],
  custom_items: [...branch.custom_items],
})

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item))
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index])

/** Catalog keys in the catalog's own order, so the PUT body is stable. */
export function facilitiesBody(draft: FacilityDraft, catalog: FacilityCatalogGroup[]): FacilityDraft {
  const order = catalog.flatMap((group) => group.items.map((item) => item.key))
  return {
    items: order.filter((key) => draft.items.includes(key)),
    custom_items: draft.custom_items.map((item) => item.trim()).filter(Boolean),
  }
}

export default function FacilitiesPage({ orgId, locationId }: { orgId: string; locationId?: string }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <FacilitiesLoader orgId={orgId} locationId={locationId} />
    </RequirePagePermission>
  )
}

function FacilitiesLoader({ orgId, locationId }: { orgId: string; locationId?: string }) {
  const { data, isLoading, refetch, isRefetching } = useFacilities(orgId)

  if (isLoading) {
    return (
      <PageEditorLayout orgId={orgId} title={TITLE}>
        <div className={styles.skeleton} aria-hidden="true">
          <span style={{ height: 380 }} />
          <span style={{ height: 240 }} />
        </div>
      </PageEditorLayout>
    )
  }

  if (!data) {
    return (
      <PageEditorLayout orgId={orgId} title={TITLE}>
        <div className={styles.state} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
          <p>Couldn&apos;t load your facilities.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </PageEditorLayout>
    )
  }

  if (data.locations.length === 0) {
    return (
      <PageEditorLayout orgId={orgId} title={TITLE}>
        <div className={styles.state} role="status">
          <Icon icon="mdi:map-marker-plus-outline" width={36} height={36} aria-hidden="true" />
          <p>Facilities belong to a branch. Add where you train first.</p>
          <Button variant="brand" href={`${orgAdminBase(orgId)}/profile?edit=profile`}>
            Add a location
          </Button>
        </div>
      </PageEditorLayout>
    )
  }

  return <FacilitiesEditor orgId={orgId} data={data} requestedId={locationId} />
}

function FacilitiesEditor({
  orgId,
  data,
  requestedId,
}: {
  orgId: string
  data: PageFacilities
  requestedId?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const ids = useId()

  const pick = (id?: string) =>
    data.locations.find((branch) => branch.location.id === id)?.location.id ?? data.locations[0].location.id

  const [branchId, setBranchId] = useState(() => pick(requestedId))
  // ?location= changing under us (back / forward) moves the branch too.
  const [seenRequest, setSeenRequest] = useState(requestedId)
  if (seenRequest !== requestedId) {
    setSeenRequest(requestedId)
    setBranchId(pick(requestedId))
  }

  const branch = data.locations.find((item) => item.location.id === branchId) ?? data.locations[0]
  const [draft, setDraft] = useState<FacilityDraft>(() => draftOf(branch))
  const [draftFor, setDraftFor] = useState(branch.location.id)
  if (draftFor !== branch.location.id) {
    // A new branch starts from what the server has for it.
    setDraftFor(branch.location.id)
    setDraft(draftOf(branch))
  }

  const [askSwitch, setAskSwitch] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useSaveLocationFacilities(orgId, branch.location.id)

  const dirty =
    !sameSet(draft.items, branch.items) || !sameList(draft.custom_items, branch.custom_items)
  const picked = draft.items.length + draft.custom_items.length

  const goTo = (id: string) => {
    setBranchId(id)
    setErrors({})
    router.replace(`${pageBase(orgId)}/facilities?location=${id}`, { scroll: false })
  }

  const toggle = (key: string) => {
    setErrors((current) => (current.items ? { ...current, items: "" } : current))
    setDraft((current) => ({
      ...current,
      items: current.items.includes(key)
        ? current.items.filter((item) => item !== key)
        : [...current.items, key],
    }))
  }

  const onSave = () => {
    if (!dirty || save.isPending) return
    save.mutate(facilitiesBody(draft, data.catalog), {
      onSuccess: (fresh) => {
        setDraft(draftOf(fresh))
        setErrors({})
        toast.show({ title: "Facilities saved", variant: "success", position: "top-center" })
      },
      onError: (err) => {
        const fieldErrors = pageFieldErrors(err)
        if (fieldErrors.items || fieldErrors.custom_items) {
          setErrors(fieldErrors)
          document.getElementById(`${ids}-catalog`)?.scrollIntoView({ block: "start" })
          return
        }
        toast.show({
          title: "Couldn't save",
          message: pageErrorSentence(err),
          variant: "error",
          position: "top-center",
        })
      },
    })
  }

  const branchOptions = data.locations.map((item) => ({
    value: item.location.id,
    label: formatBranch(item.location) || "Branch",
  }))

  return (
    <PageEditorLayout
      orgId={orgId}
      title={TITLE}
      dirty={dirty}
      action={<span className={styles.picked}>{countLabel(picked, "picked", "picked")}</span>}
      save={{ saving: save.isPending, formId: FORM_ID, label: "Save facilities" }}
    >
      {data.locations.length > 1 ? (
        <div className={styles.branch}>
          <Select
            label="Branch"
            sheetTitle="Branch"
            options={branchOptions}
            value={branch.location.id}
            onChange={(id) => {
              if (id === branch.location.id) return
              if (dirty) setAskSwitch(id)
              else goTo(id)
            }}
          />
          <p className={styles.hint}>Each branch has its own list. Tap what this one has.</p>
        </div>
      ) : (
        <p className={styles.hint}>Tap what you have. Families look for these before they visit.</p>
      )}

      <form
        id={FORM_ID}
        className={styles.card}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <div id={`${ids}-catalog`} className={styles.groups}>
          {data.catalog.map((group) => (
            <section key={group.group} className={styles.group} aria-labelledby={`${ids}-${group.group}`}>
              <h2 id={`${ids}-${group.group}`} className={styles.groupTitle}>
                {group.label}
              </h2>
              <div className={styles.chips}>
                {group.items.map((item) => {
                  const on = draft.items.includes(item.key)
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(item.key)}
                    >
                      {on && <Icon icon="mdi:check" width={16} height={16} aria-hidden="true" />}
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {errors.items && <FieldError>{errors.items}</FieldError>}

          <CustomFacilities
            items={draft.custom_items}
            onChange={(custom_items) => {
              setErrors((current) => (current.custom_items ? { ...current, custom_items: "" } : current))
              setDraft((current) => ({ ...current, custom_items }))
            }}
            error={errors.custom_items}
          />
        </div>
      </form>

      <FacilityPhotos orgId={orgId} branch={branch} />

      <ConfirmDialog
        open={askSwitch !== null}
        title="Discard changes?"
        message="What you picked for this branch hasn't been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          const next = askSwitch
          setAskSwitch(null)
          if (next) goTo(next)
        }}
        onCancel={() => setAskSwitch(null)}
      />

      <p className={styles.footnote}>
        Branches come from your profile.{" "}
        <Link href={`${orgAdminBase(orgId)}/profile?edit=profile`} className={styles.footnoteLink}>
          Manage locations
        </Link>
      </p>
    </PageEditorLayout>
  )
}
