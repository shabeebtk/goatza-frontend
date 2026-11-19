"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { pageBase } from "../../sectionMeta"
import type { PageContact } from "../../types"
import styles from "./PageHub.module.css"

const CHANNELS: { key: keyof PageContact; label: string; icon: string }[] = [
  { key: "enquiry_form_enabled", label: "Enquiry form", icon: "mdi:clipboard-text-outline" },
  { key: "whatsapp_enabled", label: "WhatsApp", icon: "mdi:whatsapp" },
  { key: "call_enabled", label: "Call", icon: "mdi:phone-outline" },
  { key: "email_enabled", label: "Email", icon: "mdi:email-outline" },
]

/** The four ways in, at a glance, and the way to change them. */
export default function ContactCard({ orgId, contact }: { orgId: string; contact: PageContact }) {
  return (
    <section className={styles.card} aria-labelledby="page-hub-contact">
      <div className={styles.cardHeader}>
        <h2 id="page-hub-contact" className={styles.cardTitle}>
          How people reach you
        </h2>
        <Link href={`${pageBase(orgId)}/contact`} className={styles.textLink}>
          Edit
          <span className={styles.srOnly}> how people reach you</span>
        </Link>
      </div>

      <ul className={styles.channels}>
        {CHANNELS.map((channel) => {
          const on = Boolean(contact[channel.key])
          return (
            <li key={channel.key} className={`${styles.channel} ${on ? "" : styles.channelOff}`}>
              <span className={`${styles.channelDot} ${on ? styles.channelDotOn : ""}`} aria-hidden="true" />
              <Icon icon={channel.icon} width={16} height={16} aria-hidden="true" />
              <span>{channel.label}</span>
              {!on && <span className={styles.channelOffLabel}>· off</span>}
              {on && <span className={styles.srOnly}>, on</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
