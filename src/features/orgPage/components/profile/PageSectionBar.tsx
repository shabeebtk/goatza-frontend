"use client"

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react"

import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { initialsOf } from "../../format"
import { useScrolledPast } from "../../hooks/useScrolledPast"
import { SECTION_CHIP_LABELS, sectionDomId } from "../../profileSections"
import type { SectionKey } from "../../types"
import styles from "./PageSectionBar.module.css"

/** Fewer sections than this and there is nothing to navigate. */
export const MIN_BAR_SECTIONS = 3

/**
 * Where the scroll-spy's band starts: the nav plus this bar (PageSectionBar.module.css
 * draws 85px on a phone, 53px on desktop). A section is "current" while it
 * crosses the band, which ends at 45% of the screen.
 */
const SPY_TOP_PHONE = 140
const SPY_TOP_DESKTOP = 116

/** How long a tap's own scroll keeps the spy from re-picking on the way. */
const TAP_LOCK_MS = 900

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The page's sticky section bar: a chip per section that rendered, in order.
 * Nothing shows until the profile header (the action row, `headerRef`) has
 * scrolled away. A tap scrolls to the section (a jump with reduced motion) and
 * moves focus there; the chip of the section in view is filled and kept in view.
 *
 * It sits in a zero-height sticky slot at the top of the page's body, so showing
 * it moves nothing: on a phone under the top bar, following it as it slides
 * (with a compact name row above the chips); on desktop under the nav.
 */
export default function PageSectionBar({
  sections,
  headerRef,
  orgName,
  logo,
}: {
  sections: SectionKey[]
  headerRef: RefObject<HTMLElement | null>
  orgName: string
  logo: string
}) {
  const shown = useScrolledPast(headerRef)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [active, setActive] = useState<SectionKey | null>(null)
  const lockUntil = useRef(0)
  const rowRef = useRef<HTMLUListElement | null>(null)

  const current = active && sections.includes(active) ? active : sections[0]
  // One string, so a new array with the same keys doesn't rebuild the observer.
  const sectionsKey = sections.join(",")

  // Scroll-spy: the first section, in order, crossing the band under the bar.
  // ONE observer for the life of the bar (a new one only if the breakpoint
  // changes, which moves the band); the sections it watches follow what
  // rendered, below, without rebuilding it.
  const keysRef = useRef<SectionKey[]>(sections)
  useEffect(() => {
    keysRef.current = sections
  })
  const spyRef = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const crossing = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) crossing.set(entry.target.id, entry.isIntersecting)
        if (performance.now() < lockUntil.current) return
        const inView = keysRef.current.find((key) => crossing.get(sectionDomId(key)))
        if (inView) setActive(inView)
      },
      { rootMargin: `-${isDesktop ? SPY_TOP_DESKTOP : SPY_TOP_PHONE}px 0px -55% 0px`, threshold: 0 }
    )
    spyRef.current = observer
    return () => {
      observer.disconnect()
      spyRef.current = null
    }
  }, [isDesktop])

  useEffect(() => {
    const observer = spyRef.current
    if (!observer) return
    const elements = sectionsKey
      .split(",")
      .map((key) => document.getElementById(sectionDomId(key)))
      .filter((element): element is HTMLElement => element !== null)
    for (const element of elements) observer.observe(element)
    return () => {
      for (const element of elements) observer.unobserve(element)
    }
  }, [sectionsKey, isDesktop])

  // A logo that fails to load becomes the initials.
  const [logoFailed, setLogoFailed] = useState<string | null>(null)
  const logoSrc = logo && logo !== logoFailed ? logo : ""

  // The current chip stays in the row's view. The row is scrolled itself, never
  // through scrollIntoView, which would also cancel the page's smooth scroll.
  useEffect(() => {
    const row = rowRef.current
    if (!row || !shown || typeof row.scrollTo !== "function") return
    const chip = row.querySelector<HTMLElement>(`[data-section="${current}"]`)
    if (!chip) return
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [current, shown])

  const go = (key: SectionKey) => (event: MouseEvent<HTMLAnchorElement>) => {
    // No hash in the URL: an extra history entry would get in the way of back.
    event.preventDefault()
    const target = document.getElementById(sectionDomId(key))
    if (!target) return
    lockUntil.current = performance.now() + TAP_LOCK_MS
    setActive(key)
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })
    // For the next Tab; the scroll above is already on its way.
    target.focus({ preventScroll: true })
  }

  if (sections.length < MIN_BAR_SECTIONS) return null

  return (
    <div className={styles.slot}>
      <nav
        aria-label="Page sections"
        className={`${styles.bar} ${shown ? styles.shown : ""}`}
        // Drops the upload pill below the bar while it is showing (UploadQueueBar).
        data-page-sticky-header={shown ? "tall" : undefined}
      >
        {/* The page's h1 already says whose page this is; this is for the eye. */}
        <div className={styles.identity} aria-hidden="true">
          <span className={styles.logo}>
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 logo, shown as stored
              <img
                src={logoSrc}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className={styles.logoImg}
                onError={() => setLogoFailed(logoSrc)}
              />
            ) : (
              initialsOf(orgName)
            )}
          </span>
          <span className={styles.orgName}>{orgName}</span>
        </div>

        <ul ref={rowRef} className={styles.chips}>
          {sections.map((key) => {
            const isCurrent = key === current
            return (
              <li key={key}>
                <a
                  href={`#${sectionDomId(key)}`}
                  data-section={key}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`${styles.chip} ${isCurrent ? styles.chipCurrent : ""}`}
                  onClick={go(key)}
                >
                  <span className={styles.chipFace}>{SECTION_CHIP_LABELS[key]}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
