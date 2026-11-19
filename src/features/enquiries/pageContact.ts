import { firstName, telHref, whatsappHref } from "./contactLinks"

/**
 * The ways a visitor can reach an org from its page, in order: the enquiry
 * form, then WhatsApp, Call and Email, each only while the club has it on. The
 * first one is the primary button wherever they are drawn (the header row, the
 * phone's sticky bar, the desktop aside), so with the form off the first of the
 * others steps up.
 */

/** What the page payload says about contact; a number or address only while it is on. */
export type PageContactInfo = {
  enquiry_form: boolean
  whatsapp: string | null
  call: string | null
  email: string | null
}

export type ContactActionKey = "enquire" | "whatsapp" | "call" | "email"

export type ContactAction = {
  key: ContactActionKey
  label: string
  /** Names the org: "WhatsApp Kannur FA". */
  ariaLabel: string
  icon: string
  /** null for the form, which opens the sheet instead. */
  href: string | null
  /** wa.me opens in a new tab; tel: and mailto: hand over to the device. */
  external: boolean
}

export const ENQUIRE_LABEL = "Enquire now"

/** WhatsApp's opening line from the page. */
export function pageWhatsappText(orgName: string): string {
  return `Hi ${orgName.trim()}, I found you on Goatza and I'd like to know more.`
}

/** WhatsApp's opening line from "Enquiry sent". */
export function sentWhatsappText(orgName: string, playerName: string): string {
  const name = firstName(playerName)
  return `Hi ${orgName.trim()}, I just sent an enquiry on Goatza about ${name || "joining"}.`
}

export const EMAIL_SUBJECT = "Enquiry from Goatza"

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(EMAIL_SUBJECT)}`
}

const filled = (value: string | null | undefined): value is string => Boolean(value && value.trim())

export function contactActions(contact: PageContactInfo | null | undefined, orgName: string): ContactAction[] {
  if (!contact) return []
  const org = orgName.trim()
  const actions: ContactAction[] = []
  if (contact.enquiry_form) {
    actions.push({
      key: "enquire",
      label: ENQUIRE_LABEL,
      ariaLabel: `${ENQUIRE_LABEL} with ${org}`,
      icon: "mdi:message-text-outline",
      href: null,
      external: false,
    })
  }
  if (filled(contact.whatsapp)) {
    actions.push({
      key: "whatsapp",
      label: "WhatsApp",
      ariaLabel: `WhatsApp ${org}`,
      icon: "mdi:whatsapp",
      href: whatsappHref(contact.whatsapp, pageWhatsappText(org)),
      external: true,
    })
  }
  if (filled(contact.call)) {
    actions.push({
      key: "call",
      label: "Call",
      ariaLabel: `Call ${org}`,
      icon: "mdi:phone-outline",
      href: telHref(contact.call),
      external: false,
    })
  }
  if (filled(contact.email)) {
    actions.push({
      key: "email",
      label: "Email",
      ariaLabel: `Email ${org}`,
      icon: "mdi:email-outline",
      href: mailtoHref(contact.email),
      external: false,
    })
  }
  return actions
}

export function hasContactAction(contact: PageContactInfo | null | undefined): boolean {
  return contactActions(contact, "").length > 0
}
