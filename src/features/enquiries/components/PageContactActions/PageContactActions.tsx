"use client"

import { Icon } from "@iconify/react"

import { useEnquiry } from "../../EnquiryContext"
import { contactActions, type ContactAction, type PageContactInfo } from "../../pageContact"
import styles from "./PageContactActions.module.css"

export type ContactLayout = "header" | "bar" | "aside"

/** The phone bar's icon buttons, after its primary. */
const BAR_EXTRAS = 2

/**
 * The ways to reach the org from its page, drawn in three places:
 *
 * - `header`: the primary on a full-width row, the rest as compact pills under it;
 * - `bar`: the phone's sticky bar, the primary big with up to two icon buttons;
 * - `aside`: the desktop CTA card, every action full width, stacked.
 *
 * The first action is the primary: "Enquire now" while the form is on,
 * otherwise whichever of WhatsApp, Call and Email comes first. The org's own
 * admins never see any of it.
 */
export default function PageContactActions({
  contact,
  orgName,
  layout,
  isMe = false,
}: {
  contact: PageContactInfo | null | undefined
  orgName: string
  layout: ContactLayout
  isMe?: boolean
}) {
  const enquiry = useEnquiry()
  const actions = contactActions(contact, orgName)
  if (isMe || actions.length === 0) return null

  const [primary, ...rest] = actions

  const control = (action: ContactAction, className: string, { iconOnly = false } = {}) => {
    const content = (
      <>
        <Icon icon={action.icon} width={20} height={20} aria-hidden="true" className={styles.icon} />
        {!iconOnly && <span className={styles.label}>{action.label}</span>}
      </>
    )
    if (!action.href) {
      return (
        <button
          type="button"
          className={className}
          aria-label={action.ariaLabel}
          aria-haspopup="dialog"
          onClick={() => enquiry.open()}
        >
          {content}
        </button>
      )
    }
    return (
      <a
        href={action.href}
        className={className}
        aria-label={action.ariaLabel}
        data-contact={action.key}
        {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content}
      </a>
    )
  }

  if (layout === "bar") {
    return (
      <div className={styles.bar}>
        {control(primary, `${styles.action} ${styles.primary} ${styles.barPrimary}`)}
        {rest.slice(0, BAR_EXTRAS).map((action) => (
          <span key={action.key} className={styles.barExtra}>
            {control(action, `${styles.action} ${styles.iconButton}`, { iconOnly: true })}
          </span>
        ))}
      </div>
    )
  }

  if (layout === "aside") {
    return (
      <ul className={styles.stack}>
        {actions.map((action, index) => (
          <li key={action.key}>
            {control(
              action,
              `${styles.action} ${index === 0 ? styles.primary : styles.onDark} ${styles.block}`
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={styles.header}>
      {control(primary, `${styles.action} ${styles.primary} ${styles.block}`)}
      {rest.length > 0 && (
        <ul className={styles.pills}>
          {rest.map((action) => (
            <li key={action.key}>{control(action, `${styles.action} ${styles.pill}`)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
