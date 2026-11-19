"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { factRows, linkPills } from "../../profileSections"
import type { ShowcaseFacts } from "../../types"
import ProfileSection from "./ProfileSection"
import styles from "./AboutSection.module.css"

/**
 * About on the page: the description (four lines, then "Read more"), the key
 * facts that are filled, and the links. The owner with nothing written keeps
 * the profile's old hint. Nothing at all when there is nothing to show.
 */
export default function AboutSection({
  orgName,
  description,
  website,
  level,
  facts,
  isMe,
  omitFacts = [],
}: {
  orgName: string
  description: string
  website: string
  level: string
  facts: ShowcaseFacts | null
  isMe: boolean
  /** Facts shown elsewhere at this width (the desktop aside's Quick facts). */
  omitFacts?: readonly string[]
}) {
  const text = description.trim()
  const rows = factRows(facts, level).filter((row) => !omitFacts.includes(row.key))
  const pills = linkPills(orgName, website, facts?.links)

  if (!text && rows.length === 0 && pills.length === 0 && !isMe) return null

  return (
    <ProfileSection sectionKey="about" title="About">
      {text ? (
        <Description text={text} />
      ) : isMe ? (
        <p className={styles.emptyHint}>Add a description — click Edit Organization above.</p>
      ) : null}

      {rows.length > 0 && (
        <dl className={styles.facts}>
          {rows.map((row) => (
            <div key={row.key} className={styles.fact}>
              {/* Inside the dt: a div in a dl may hold only dt and dd. */}
              <dt className={styles.factLabel}>
                <span className={styles.factIcon} aria-hidden="true">
                  <Icon icon={row.icon} width={18} height={18} />
                </span>
                {row.label}
              </dt>
              <dd className={styles.factValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {pills.length > 0 && (
        <ul className={styles.links}>
          {pills.map((pill) => (
            <li key={pill.key}>
              <a
                href={pill.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={pill.ariaLabel}
                className={styles.link}
              >
                <Icon icon={pill.icon} width={16} height={16} aria-hidden="true" />
                {pill.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  )
}

/**
 * Clamped to four lines. The toggle shows only when the text really overflows
 * the clamp, measured on the element (a ResizeObserver, so a rotation or a font
 * swap re-measures), never by counting characters.
 */
function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const id = useId()

  useEffect(() => {
    const element = ref.current
    // Open, there is no clamp to measure against; the last answer stands.
    if (!element || expanded || typeof ResizeObserver === "undefined") return
    // The observer reports once on observe, then on every resize.
    const observer = new ResizeObserver(() => {
      setOverflows(element.scrollHeight > element.clientHeight + 1)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <div className={styles.description}>
      <p ref={ref} id={id} className={`${styles.text} ${expanded ? "" : styles.clamped}`}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          className={styles.readMore}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  )
}
