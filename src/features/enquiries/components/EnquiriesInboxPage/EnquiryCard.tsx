"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { telHref, whatsappGreeting, whatsappHref } from "../../contactLinks"
import { contactName, forLine, noteLine, programLine, relativeTime } from "../../enquiryFormat"
import type { InboxItem } from "../../types"
import styles from "./EnquiriesInboxPage.module.css"

/**
 * One enquiry in the inbox. The whole card opens the detail (a stretched link);
 * Call, WhatsApp and Mark contacted sit above it and do their own thing.
 */
export default function EnquiryCard({
  item,
  href,
  orgName,
  onMarkContacted,
  now,
}: {
  item: InboxItem
  href: string
  orgName: string
  /** Only on the New tab. */
  onMarkContacted?: () => void
  now?: Date
}) {
  const name = contactName(item)
  const note = noteLine(item)
  const isNew = item.status === "new"

  return (
    <li className={`${styles.card} ${isNew ? styles.cardNew : ""}`}>
      <div className={styles.cardTop}>
        {isNew && <span className={styles.unreadDot} aria-hidden="true" />}
        <Link href={href} className={styles.cardLink}>
          <span className={styles.cardName}>{name}</span>
          <span className={styles.cardFor}> · {forLine(item)}</span>
          {isNew && <span className={styles.srOnly}>, new</span>}
        </Link>
        <time className={styles.cardTime} dateTime={item.created_at}>
          {relativeTime(item.created_at, now)}
        </time>
      </div>
      <p className={styles.cardProgram}>{programLine(item)}</p>
      {note && <p className={styles.cardNote}>{note}</p>}

      <div className={styles.cardActions}>
        <a href={telHref(item.phone)} className={styles.roundButton} aria-label={`Call ${name}`}>
          <Icon icon="mdi:phone" width={20} height={20} aria-hidden="true" />
        </a>
        {item.phone_is_whatsapp && (
          <a
            href={whatsappHref(item.phone, whatsappGreeting({ enquiry: item, orgName }))}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.roundButton} ${styles.whatsapp}`}
            aria-label={`WhatsApp ${name}`}
          >
            <Icon icon="mdi:whatsapp" width={20} height={20} aria-hidden="true" />
          </a>
        )}
        {onMarkContacted && (
          <button type="button" className={styles.markButton} onClick={onMarkContacted}>
            <Icon icon="mdi:check" width={18} height={18} aria-hidden="true" />
            Mark contacted
          </button>
        )}
      </div>
    </li>
  )
}
