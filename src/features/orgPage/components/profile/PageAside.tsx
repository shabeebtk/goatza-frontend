"use client"

import { Icon } from "@iconify/react"

import PageContactActions from "@/features/enquiries/components/PageContactActions/PageContactActions"
import { hasContactAction } from "@/features/enquiries/pageContact"
import { orgNoun } from "../../format"
import { quickFactRows, type ProfileLocation } from "../../profileSections"
import type { PageShowcase } from "../../types"
import LocationsSection from "./LocationsSection"
import styles from "./PageAside.module.css"

/** What the aside reads from the profile. */
export type PageAsideOrg = { name: string; type: string; locations: ProfileLocation[] }

/** Whether the aside would draw anything: the page is single column when it wouldn't. */
export function asideHasContent(page: PageShowcase, org: PageAsideOrg, isMe: boolean): boolean {
  return (
    (!isMe && hasContactAction(page.contact)) ||
    showsLocations(page, org) ||
    quickFactRows(page.facts).length > 0
  )
}

function showsLocations(page: PageShowcase, org: PageAsideOrg): boolean {
  return (page.order ?? []).includes("locations") && (org.locations ?? []).length > 0
}

/**
 * The desktop aside (from 1024px), sticky under the nav: the CTA card when
 * the page has any contact action (never for the org's own admins), the
 * branches, and a compact list of quick facts. What it shows is left out of the
 * main column at this width, so nothing is there twice.
 */
export default function PageAside({
  page,
  org,
  isMe,
}: {
  page: PageShowcase
  org: PageAsideOrg
  isMe: boolean
}) {
  const noun = orgNoun(org.type)
  const facts = quickFactRows(page.facts)
  const cta = !isMe && hasContactAction(page.contact)

  return (
    <aside className={styles.aside} aria-label={`About joining ${org.name}`}>
      {cta && (
        <div className={styles.cta}>
          <h2 className={styles.ctaTitle}>Interested in joining?</h2>
          <p className={styles.ctaText}>
            {page.contact?.enquiry_form
              ? `Send an enquiry and the ${noun} will contact you. No account needed.`
              : `Reach the ${noun} directly.`}
          </p>
          <PageContactActions contact={page.contact} orgName={org.name} layout="aside" isMe={isMe} />
        </div>
      )}

      {showsLocations(page, org) && (
        <div className={styles.card}>
          <LocationsSection locations={org.locations} divider={false} />
        </div>
      )}

      {facts.length > 0 && (
        <section className={styles.card} aria-labelledby="page-quick-facts-title">
          <h2 id="page-quick-facts-title" className={styles.cardTitle}>
            Quick facts
          </h2>
          <dl className={styles.facts}>
            {facts.map((row) => (
              <div key={row.key} className={styles.fact}>
                <dt className={styles.factLabel}>
                  <Icon icon={row.icon} width={16} height={16} aria-hidden="true" />
                  {row.label}
                </dt>
                <dd className={styles.factValue}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </aside>
  )
}
