"use client"

import { useId, useState, type ReactNode } from "react"
import { isAxiosError } from "axios"
import { Icon } from "@iconify/react"

import { formatPhone } from "@/features/orgPage/format"
import { usePageOrg } from "@/features/orgPage/hooks/usePageOrg"
import { ENQUIRIES_FORBIDDEN_SENTENCE } from "@/features/orgPage/pageErrors"
import PageEditorLayout from "@/features/orgPage/components/PageEditorLayout/PageEditorLayout"
import { PageTextArea } from "@/features/orgPage/components/PageFields/PageFields"
import PageSegmented from "@/features/orgPage/components/PageSegmented/PageSegmented"
import RequirePagePermission, {
  PagePermissionState,
} from "@/features/orgPage/components/RequirePagePermission/RequirePagePermission"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { telHref, whatsappGreeting, whatsappHref } from "../../contactLinks"
import {
  BEST_TIME_LABELS,
  STATUS_LABELS,
  changedAtLabel,
  contactName,
  receivedLabel,
} from "../../enquiryFormat"
import { useEnquiry, useUpdateEnquiry } from "../../hooks/useEnquiries"
import { ENQUIRY_STATUSES, type EnquiryDetail, type EnquiryStatus } from "../../types"
import { enquiriesBase } from "../EnquiriesInboxPage/EnquiriesInboxPage"
import styles from "./EnquiryDetailPage.module.css"

export const NOTES_MAX = 2000

const STATUS_OPTIONS = ENQUIRY_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))

export default function EnquiryDetailPage({ orgId, enquiryId }: { orgId: string; enquiryId: string }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.ENQUIRIES_MANAGE}>
      <DetailLoader orgId={orgId} enquiryId={enquiryId} />
    </RequirePagePermission>
  )
}

function DetailLoader({ orgId, enquiryId }: { orgId: string; enquiryId: string }) {
  const { data, isLoading, error, refetch, isRefetching } = useEnquiry(orgId, enquiryId)
  const inbox = enquiriesBase(orgId)
  const back = { fallback: inbox, label: "Back to enquiries" }

  if (isLoading) {
    return (
      <PageEditorLayout orgId={orgId} title="Enquiry" back={back}>
        <div className={styles.skeleton} aria-hidden="true">
          <span style={{ height: 52 }} />
          <span style={{ height: 300 }} />
          <span style={{ height: 160 }} />
        </div>
      </PageEditorLayout>
    )
  }

  if (!data) {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 403) return <PagePermissionState orgId={orgId} message={ENQUIRIES_FORBIDDEN_SENTENCE} />
    return (
      <PageEditorLayout orgId={orgId} title="Enquiry" back={back}>
        {status === 404 ? (
          <div className={styles.state} role="status">
            <Icon icon="mdi:inbox-remove-outline" width={36} height={36} aria-hidden="true" />
            <p>This enquiry isn&apos;t available any more.</p>
            <Button variant="outline" href={inbox}>
              Back to inbox
            </Button>
          </div>
        ) : (
          <div className={styles.state} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
            <p>Couldn&apos;t load this enquiry.</p>
            <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}
      </PageEditorLayout>
    )
  }

  return <Detail key={data.id} orgId={orgId} enquiry={data} />
}

function Detail({ orgId, enquiry }: { orgId: string; enquiry: EnquiryDetail }) {
  const ids = useId()
  const toast = useToast()
  const org = usePageOrg(orgId)
  const update = useUpdateEnquiry(orgId)

  const [savedNotes, setSavedNotes] = useState(enquiry.notes ?? "")
  const [notes, setNotes] = useState(enquiry.notes ?? "")
  const notesChanged = notes.trim() !== savedNotes.trim()

  const name = contactName(enquiry)
  const greeting = whatsappGreeting({ enquiry, orgName: org?.name ?? "" })
  const closed = enquiry.status === "joined" || enquiry.status === "not_interested"

  const setStatus = (next: EnquiryStatus) => {
    if (next === enquiry.status || update.isPending) return
    update.mutate(
      { enquiryId: enquiry.id, body: { status: next } },
      {
        onSuccess: () => toast.show({ title: "Status saved", variant: "success", position: "top-center" }),
        onError: (err) =>
          toast.show({
            title: "Couldn't save the status",
            message: getApiErrorMessage(err),
            variant: "error",
            position: "top-center",
          }),
      }
    )
  }

  const saveNotes = () => {
    const text = notes.trim()
    update.mutate(
      { enquiryId: enquiry.id, body: { notes: text } },
      {
        onSuccess: (detail) => {
          setSavedNotes(detail.notes ?? text)
          setNotes(detail.notes ?? text)
          toast.show({ title: "Notes saved", variant: "success", position: "top-center" })
        },
        onError: (err) =>
          toast.show({
            title: "Couldn't save the notes",
            message: getApiErrorMessage(err),
            variant: "error",
            position: "top-center",
          }),
      }
    )
  }

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(enquiry.phone)
      toast.show({ title: "Number copied", variant: "success", position: "top-center", duration: 2000 })
    } catch {
      toast.show({ title: "Couldn't copy", message: formatPhone(enquiry.phone), variant: "warning", position: "top-center" })
    }
  }

  const rows: { label: string; value: ReactNode; muted?: boolean }[] = [
    {
      label: "For",
      value:
        enquiry.for_whom === "child"
          ? `${enquiry.player_name}, ${enquiry.player_age}`
          : `Themselves, ${enquiry.player_age}`,
    },
    ...(enquiry.for_whom === "child"
      ? [{ label: "Parent or guardian", value: enquiry.guardian_name || "Not given", muted: !enquiry.guardian_name }]
      : []),
    {
      label: "Phone",
      value: (
        <span className={styles.phoneValue}>
          <span>
            {formatPhone(enquiry.phone)}
            {enquiry.phone_is_whatsapp ? " · WhatsApp" : ""}
          </span>
          <button
            type="button"
            className={styles.copyButton}
            aria-label="Copy phone number"
            onClick={() => void copyPhone()}
          >
            <Icon icon="mdi:content-copy" width={18} height={18} aria-hidden="true" />
          </button>
        </span>
      ),
    },
    { label: "Email", value: enquiry.email || "Not given", muted: !enquiry.email },
    { label: "Program", value: enquiry.program_name || "General enquiry", muted: !enquiry.program_name },
    ...(enquiry.location_name ? [{ label: "Branch", value: enquiry.location_name }] : []),
    {
      label: "Best time",
      value: enquiry.best_time ? enquiry.best_time_label || BEST_TIME_LABELS[enquiry.best_time] : "Any time",
    },
    { label: "Received", value: receivedLabel(enquiry.created_at) },
  ]

  return (
    <PageEditorLayout
      orgId={orgId}
      title={name}
      dirty={notesChanged}
      back={{ fallback: `${enquiriesBase(orgId)}${enquiry.status === "new" ? "" : `?status=${enquiry.status}`}`, label: "Back to enquiries" }}
      action={
        <span className={`${styles.statusPill} ${styles[`status_${enquiry.status}`] ?? ""}`}>
          {enquiry.status_label || STATUS_LABELS[enquiry.status]}
        </span>
      }
    >
      <div className={styles.contactActions}>
        <a href={telHref(enquiry.phone)} className={styles.callButton}>
          <Icon icon="mdi:phone" width={20} height={20} aria-hidden="true" />
          Call
        </a>
        {enquiry.phone_is_whatsapp && (
          <a
            href={whatsappHref(enquiry.phone, greeting)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.whatsappButton}
          >
            <Icon icon="mdi:whatsapp" width={20} height={20} aria-hidden="true" />
            WhatsApp
          </a>
        )}
      </div>
      {enquiry.phone_is_whatsapp && (
        <p className={styles.greeting}>
          WhatsApp opens with: <q>{greeting}</q>
        </p>
      )}

      <section className={styles.card} aria-label="Details">
        <dl className={styles.details}>
          {rows.map((row) => (
            <div key={row.label} className={styles.detailRow}>
              <dt>{row.label}</dt>
              <dd className={row.muted ? styles.muted : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {enquiry.message.trim() && (
        <section className={styles.card} aria-labelledby={`${ids}-message`}>
          <h2 id={`${ids}-message`} className={styles.cardTitle}>
            Their message
          </h2>
          <p className={styles.message}>{enquiry.message}</p>
        </section>
      )}

      <section className={styles.card} aria-labelledby={`${ids}-status`}>
        <h2 id={`${ids}-status`} className={styles.cardTitle}>
          Status
        </h2>
        <PageSegmented
          labelledBy={`${ids}-status`}
          options={STATUS_OPTIONS}
          value={enquiry.status}
          onChange={setStatus}
        />
      </section>

      <section className={styles.card} aria-label="Notes">
        <PageTextArea
          id={`${ids}-notes`}
          label="Notes (only your team sees these)"
          rows={4}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Called on Monday, coming for a trial on Saturday."
          aside={
            <span className={styles.counter}>
              {notes.length} / {NOTES_MAX}
            </span>
          }
          hint={
            enquiry.notes_updated_by && enquiry.notes_updated_at
              ? `Last edited by ${enquiry.notes_updated_by} · ${changedAtLabel(enquiry.notes_updated_at)}`
              : undefined
          }
        />
        {notesChanged && (
          <div className={styles.notesActions}>
            <Button variant="brand" loading={update.isPending} onClick={saveNotes}>
              Save notes
            </Button>
          </div>
        )}
      </section>

      <div className={styles.footer}>
        {enquiry.status_changed_by && enquiry.status_changed_at && (
          <p>
            Marked {(enquiry.status_label || STATUS_LABELS[enquiry.status]).toLowerCase()} by{" "}
            {enquiry.status_changed_by} · {changedAtLabel(enquiry.status_changed_at)}
          </p>
        )}
        {closed && <p>Closed enquiries are deleted after 12 months.</p>}
      </div>
    </PageEditorLayout>
  )
}
