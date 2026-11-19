"use client"

import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { formatPhone, orgNoun } from "../../format"
import { useUpdateContact } from "../../hooks/useOrgPage"
import { usePageOrg } from "../../hooks/usePageOrg"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import { orgAdminBase } from "../../sectionMeta"
import type { PageContact } from "../../types"
import PageAdminGate from "../PageAdminGate/PageAdminGate"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import { PageTextField } from "../PageFields/PageFields"
import PageSwitch from "../PageSwitch/PageSwitch"
import styles from "./ContactSettingsPage.module.css"

const TITLE = "How people reach you"
const FORM_ID = "page-contact-form"

/** The form's own copy of the contact options: numbers as the person reads them. */
type ContactForm = PageContact

function toForm(contact: PageContact): ContactForm {
  return {
    ...contact,
    whatsapp_number: formatPhone(contact.whatsapp_number),
    call_number: formatPhone(contact.call_number),
  }
}

/**
 * What changed, and only that. A number or email is sent only while its option is
 * on (a hidden field's edit is not a change), and exactly as typed: the server
 * normalizes numbers.
 */
function changesFrom(form: ContactForm, saved: ContactForm): Partial<PageContact> {
  const out: Partial<PageContact> = {}
  if (form.enquiry_form_enabled !== saved.enquiry_form_enabled) {
    out.enquiry_form_enabled = form.enquiry_form_enabled
  }
  if (form.whatsapp_enabled !== saved.whatsapp_enabled) out.whatsapp_enabled = form.whatsapp_enabled
  if (form.call_enabled !== saved.call_enabled) out.call_enabled = form.call_enabled
  if (form.email_enabled !== saved.email_enabled) out.email_enabled = form.email_enabled

  if (form.whatsapp_enabled && form.whatsapp_number.trim() !== saved.whatsapp_number.trim()) {
    out.whatsapp_number = form.whatsapp_number.trim()
  }
  if (form.call_enabled && form.call_number.trim() !== saved.call_number.trim()) {
    out.call_number = form.call_number.trim()
  }
  if (form.email_enabled && form.contact_email.trim() !== saved.contact_email.trim()) {
    out.contact_email = form.contact_email.trim()
  }
  return out
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The server's "on needs a value" rules, checked before anything is sent. */
function clientErrors(form: ContactForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.whatsapp_enabled && !form.whatsapp_number.trim()) {
    errors.whatsapp_number = "Add your WhatsApp number to turn this on."
  }
  if (form.call_enabled && !form.call_number.trim()) {
    errors.call_number = "Add a phone number to turn this on."
  }
  if (form.email_enabled) {
    const email = form.contact_email.trim()
    if (!email) errors.contact_email = "Add an email address to turn this on."
    else if (!EMAIL_SHAPE.test(email)) errors.contact_email = "Enter a valid email address."
  }
  return errors
}

const FIELD_ORDER = ["whatsapp_number", "call_number", "contact_email"]

export default function ContactSettingsPage({ orgId }: { orgId: string }) {
  return (
    <PageAdminGate orgId={orgId} title={TITLE} skeletonBlocks={[132, 112, 112, 112]}>
      {(admin) => <ContactEditor orgId={orgId} contact={admin.settings.contact} />}
    </PageAdminGate>
  )
}

function ContactEditor({ orgId, contact }: { orgId: string; contact: PageContact }) {
  const org = usePageOrg(orgId)
  const noun = orgNoun(org?.type)
  const toast = useToast()
  const updateContact = useUpdateContact(orgId)
  const ids = useId()

  // The baseline is what was last saved; a background refetch of the hub never
  // overwrites what is being typed.
  const [saved, setSaved] = useState(() => toForm(contact))
  const [form, setForm] = useState(saved)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [askFormOff, setAskFormOff] = useState(false)

  const changes = changesFrom(form, saved)
  const dirty = Object.keys(changes).length > 0

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    // A field's error goes once it is touched, and so does the one its switch caused.
    setErrors((current) => {
      if (!(key in current) && !String(key).endsWith("_enabled")) return current
      const next = { ...current }
      delete next[key as string]
      if (key === "whatsapp_enabled") delete next.whatsapp_number
      if (key === "call_enabled") delete next.call_number
      if (key === "email_enabled") delete next.contact_email
      return next
    })
  }

  const focusFirstError = (fieldErrors: Record<string, string>) => {
    const first = FIELD_ORDER.find((field) => fieldErrors[field])
    if (!first) return
    const element = document.getElementById(`${ids}-${first}`)
    element?.focus()
    element?.scrollIntoView({ block: "center" })
  }

  const save = () => {
    if (!dirty || updateContact.isPending) return
    const local = clientErrors(form)
    if (Object.keys(local).length) {
      setErrors(local)
      focusFirstError(local)
      return
    }

    updateContact.mutate(changes, {
      onSuccess: (settings) => {
        const next = toForm(settings.contact)
        setSaved(next)
        setForm(next)
        setErrors({})
        toast.show({ title: "Contact options saved", variant: "success", position: "top-center" })
      },
      onError: (err) => {
        const fieldErrors = pageFieldErrors(err)
        const onFields = Object.fromEntries(
          Object.entries(fieldErrors).filter(([field]) => FIELD_ORDER.includes(field))
        )
        if (Object.keys(onFields).length) {
          setErrors(onFields)
          focusFirstError(onFields)
        } else {
          toast.show({
            title: "Couldn't save",
            message: pageErrorSentence(err),
            variant: "error",
            position: "top-center",
          })
        }
      },
    })
  }

  const fieldId = (field: string) => `${ids}-${field}`

  return (
    <PageEditorLayout
      orgId={orgId}
      title={TITLE}
      dirty={dirty}
      save={{ saving: updateContact.isPending, formId: FORM_ID }}
    >
      <p className={styles.intro}>
        Choose the ways visitors can contact your {noun}. Each one shows as a button on your page.
      </p>

      <form
        id={FORM_ID}
        className={styles.cards}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <ContactOption
          icon="mdi:clipboard-text-outline"
          title="Enquiry form"
          badge="Recommended"
          description="Visitors fill a short form. It lands in your Enquiries inbox, and your number stays private."
          checked={form.enquiry_form_enabled}
          onChange={(next) =>
            next ? set("enquiry_form_enabled", true) : setAskFormOff(true)
          }
        />

        <ContactOption
          icon="mdi:whatsapp"
          title="WhatsApp"
          description="A WhatsApp button that opens a chat with you."
          checked={form.whatsapp_enabled}
          onChange={(next) => set("whatsapp_enabled", next)}
        >
          <PageTextField
            id={fieldId("whatsapp_number")}
            label="WhatsApp number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={form.whatsapp_number}
            onChange={(event) => set("whatsapp_number", event.target.value)}
            error={errors.whatsapp_number}
            hint="Anyone who opens your page can see this number."
          />
        </ContactOption>

        <ContactOption
          icon="mdi:phone-outline"
          title="Call"
          description="A Call button with your number."
          checked={form.call_enabled}
          onChange={(next) => set("call_enabled", next)}
        >
          <PageTextField
            id={fieldId("call_number")}
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={form.call_number}
            onChange={(event) => set("call_number", event.target.value)}
            error={errors.call_number}
            hint="Anyone who opens your page can see this number."
            aside={
              form.whatsapp_number.trim() &&
              form.call_number.trim() !== form.whatsapp_number.trim() ? (
                <button
                  type="button"
                  className={styles.quickFill}
                  onClick={() => set("call_number", form.whatsapp_number)}
                >
                  <Icon icon="mdi:content-duplicate" width={14} height={14} aria-hidden="true" />
                  Same as WhatsApp
                </button>
              ) : null
            }
          />
        </ContactOption>

        <ContactOption
          icon="mdi:email-outline"
          title="Email"
          description="An Email button that opens their mail app."
          checked={form.email_enabled}
          onChange={(next) => set("email_enabled", next)}
        >
          <PageTextField
            id={fieldId("contact_email")}
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="hello@example.com"
            value={form.contact_email}
            onChange={(event) => set("contact_email", event.target.value)}
            error={errors.contact_email}
          />
        </ContactOption>
      </form>

      <p className={styles.footerNote}>
        New enquiries notify owners and staff.{" "}
        <Link href={`${orgAdminBase(orgId)}/members`} className={styles.footerLink}>
          Members
        </Link>
      </p>

      <ConfirmDialog
        open={askFormOff}
        title="Turn off the enquiry form?"
        message="Nobody new can send you an enquiry. Your inbox stays."
        confirmLabel="Turn off"
        cancelLabel="Keep it on"
        tone="danger"
        onConfirm={() => {
          setAskFormOff(false)
          set("enquiry_form_enabled", false)
        }}
        onCancel={() => setAskFormOff(false)}
      />
    </PageEditorLayout>
  )
}

/** One way in: icon, title, what it does, its switch, and its field while it is on. */
function ContactOption({
  icon,
  title,
  badge,
  description,
  checked,
  onChange,
  children,
}: {
  icon: string
  title: string
  badge?: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
  children?: ReactNode
}) {
  const descriptionId = useId()

  return (
    <section className={`${styles.card} ${checked ? styles.cardOn : ""}`} aria-label={title}>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon} aria-hidden="true">
          <Icon icon={icon} width={22} height={22} />
        </span>
        <div className={styles.cardText}>
          <h2 className={styles.cardTitle}>
            {title}
            {badge && <span className={styles.badge}>{badge}</span>}
          </h2>
          <p id={descriptionId} className={styles.cardDescription}>
            {description}
          </p>
        </div>
        <PageSwitch
          label={title}
          describedBy={descriptionId}
          checked={checked}
          onChange={onChange}
        />
      </div>
      {checked && children && <div className={styles.cardField}>{children}</div>}
    </section>
  )
}
