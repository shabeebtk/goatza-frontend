"use client"

import { useState, type RefObject } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { useFollowOrg } from "@/features/organization/hooks/useOrganizations"
import { publicPagePath } from "@/features/orgPage/format"
import Button from "@/shared/components/ui/Button/Button"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { whatsappHref } from "../../contactLinks"
import { sentSummary, type SentSnapshot } from "../../enquiryForm"
import { sentWhatsappText } from "../../pageContact"
import type { EnquirySent } from "../../types"
import type { EnquirySheetOrg } from "./EnquirySheet"
import styles from "./EnquirySheet.module.css"

/**
 * "Enquiry sent", in the sheet the form was in: the number the club will call
 * (masked, as the server sent it back), what was asked about, a quicker way in
 * on WhatsApp when the club has it on, and a nudge to follow.
 */
export default function EnquirySentView({
  org,
  noun,
  enquiry,
  snapshot,
  whatsapp,
  anonymous,
  headingRef,
  onDone,
}: {
  org: EnquirySheetOrg
  noun: string
  enquiry: EnquirySent
  snapshot: SentSnapshot
  /** The club's WhatsApp, only while it is on. */
  whatsapp: string | null
  anonymous: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  onDone: () => void
}) {
  const summary = sentSummary(snapshot, enquiry)
  const { follow } = useFollowOrg(org.id, org.username)
  // Following from here hides the prompt (the profile's cache says following);
  // this line says it worked.
  const [followedHere, setFollowedHere] = useState(false)

  return (
    <div className={styles.sent}>
      <span className={styles.sentCheck} aria-hidden="true">
        <Icon icon="mdi:check" width={32} height={32} />
      </span>
      <h3 ref={headingRef} tabIndex={-1} className={styles.sentTitle}>
        Enquiry sent
      </h3>
      <p className={styles.sentLead}>
        {org.name} will contact you
        {enquiry.phone_masked ? (
          <>
            {" "}
            on <span className={styles.sentPhone}>{enquiry.phone_masked}</span>
          </>
        ) : null}
        .
      </p>

      <div className={styles.summary}>
        {summary.who && <p className={styles.summaryWho}>{summary.who}</p>}
        {summary.when && <p className={styles.summaryWhen}>{summary.when}</p>}
      </div>

      {whatsapp && (
        <div className={styles.sooner}>
          <p className={styles.soonerText}>Want to talk sooner?</p>
          <a
            href={whatsappHref(whatsapp, sentWhatsappText(org.name, snapshot.playerName))}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.whatsapp}
            aria-label={`Message ${org.name} on WhatsApp`}
          >
            <Icon icon="mdi:whatsapp" width={20} height={20} aria-hidden="true" />
            Message on WhatsApp
          </a>
        </div>
      )}

      <Button variant="brand" fullWidth onClick={onDone} className={styles.sentDone}>
        Back to the {noun}
      </Button>

      {anonymous ? (
        <Link href={authUrlWithNext(publicPagePath(org.username), "signup")} className={styles.followLink}>
          <Icon icon="mdi:plus" width={18} height={18} aria-hidden="true" />
          Follow the {noun} on Goatza
        </Link>
      ) : followedHere ? (
        <p className={styles.followed} role="status">
          <Icon icon="mdi:check" width={18} height={18} aria-hidden="true" />
          You&apos;re following {org.name}
        </p>
      ) : !org.isFollowing ? (
        <Button
          variant="outline"
          fullWidth
          loading={follow.isPending}
          leftIcon={<Icon icon="mdi:plus" width={18} height={18} />}
          onClick={() => {
            // The follow is optimistic, so the line is too; a refusal takes both back.
            setFollowedHere(true)
            follow.mutate(undefined, { onError: () => setFollowedHere(false) })
          }}
        >
          Follow {org.name}
        </Button>
      ) : null}
    </div>
  )
}
