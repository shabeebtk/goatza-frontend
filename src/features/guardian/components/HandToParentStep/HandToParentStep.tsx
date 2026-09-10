"use client"

import { Icon } from "@iconify/react"

import {
  HAND_TO_PARENT_HEADING,
  HAND_TO_PARENT_SUBHEADING,
} from "../../guardianCopy"
import { approveSharedContactApi } from "../../services/guardian.api"
import type { GuardianApprovalPayload } from "../../types"
import GuardianDataList from "../GuardianDataList/GuardianDataList"
import ParentApprovalForm from "../ParentApprovalForm/ParentApprovalForm"
import styles from "./HandToParentStep.module.css"

/**
 * The parent is right here — so ask them right here.
 *
 * Reached when POST /guardian/details comes back `shared_contact`: the contact
 * the child gave is one the parent already uses, so there is nobody to email
 * and nothing to wait for. The phone changes hands and the approval happens on
 * this screen.
 *
 * WHY THE HEADING TALKS TO THE CHILD AND EVERYTHING BELOW TALKS TO THE PARENT.
 * Two people read this screen, in that order, seconds apart. The first line is
 * an instruction to the person holding the phone; from the divider down, every
 * word assumes the phone has been handed over. Mixing the two — "ask your
 * parent to confirm they are 18" — would leave the parent reading a sentence
 * addressed to somebody else and having to work out which parts are theirs.
 *
 * On success the gate is down and the child goes straight into the app. There
 * is no confirmation screen: the parent already saw what they agreed to, and a
 * "done!" page between them and the thing they just approved is a step that
 * exists only to be tapped through.
 */

interface HandToParentStepProps {
  /** Approval landed. The caller takes it from here — usually into the app. */
  onApproved: () => void
}

export default function HandToParentStep({
  onApproved,
}: HandToParentStepProps) {
  const handleApprove = async (payload: GuardianApprovalPayload) => {
    await approveSharedContactApi(payload)
    onApproved()
  }

  return (
    <div className={styles.step}>
      {/* ── To the child ── */}
      <div className={styles.handoff}>
        <Icon
          icon="mdi:cellphone-arrow-down"
          className={styles.handoffIcon}
          width={24}
          height={24}
          aria-hidden="true"
        />
        <div>
          <p className={styles.title}>{HAND_TO_PARENT_HEADING}</p>
          <p className={styles.subtitle}>{HAND_TO_PARENT_SUBHEADING}</p>
        </div>
      </div>

      <hr className={styles.divider} />

      {/* ── To the parent ── */}
      <GuardianDataList />

      <div className={styles.formWrap}>
        <ParentApprovalForm onApprove={handleApprove} submitLabel="Approve" />
      </div>
    </div>
  )
}
