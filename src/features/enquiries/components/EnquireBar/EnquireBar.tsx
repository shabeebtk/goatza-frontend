"use client"

import type { RefObject } from "react"

import { useScrolledPast } from "@/features/orgPage/hooks/useScrolledPast"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { useEnquiry } from "../../EnquiryContext"
import { hasContactAction, type PageContactInfo } from "../../pageContact"
import PageContactActions from "../PageContactActions/PageContactActions"
import styles from "./EnquireBar.module.css"

/**
 * The phone's sticky Enquire bar (below 768px, visitors only): the page's
 * primary contact action as a big button with up to two icon buttons. It shows
 * once the header's action row has scrolled away, hides when it comes back and
 * while the enquiry sheet is open. Signed in it rides above the dock and
 * follows it as it slides; logged out it sits at the bottom, in place of
 * PublicCtaBar.
 *
 * Portalled, because the profile's entrance animation leaves a transform that
 * would capture `position: fixed`. The spacer stays in the page, so the bar
 * never covers the last post.
 */
export default function EnquireBar({
  contact,
  orgName,
  headerRef,
}: {
  contact: PageContactInfo | null | undefined
  orgName: string
  headerRef: RefObject<HTMLElement | null>
}) {
  const isPhone = useMediaQuery("(max-width: 767px)")
  const past = useScrolledPast(headerRef)
  const { isOpen } = useEnquiry()

  if (!isPhone || !hasContactAction(contact)) return null
  const shown = past && !isOpen

  return (
    <>
      <div className={styles.space} aria-hidden="true" />
      <Portal>
        <div
          className={`${styles.bar} ${shown ? styles.shown : ""}`}
          // Out of the tab order and the accessibility tree while hidden; the
          // header row it repeats is on screen then.
          aria-hidden={shown ? undefined : true}
          inert={!shown}
          data-enquire-bar=""
        >
          <div className={styles.inner}>
            <PageContactActions contact={contact} orgName={orgName} layout="bar" />
          </div>
        </div>
      </Portal>
    </>
  )
}
