"use client"

/**
 * Settings → Mentions. The signed-in PERSON's mentions; the org-admin area
 * renders the same list under its own route, where the actor headers make it
 * the org's.
 */

import { BackHeader } from "@/shared/components/ui"
import MentionsList from "@/features/posts/components/MentionsList/MentionsList"
import styles from "./MentionsPage.module.css"

export default function MentionsPage() {
  return (
    <div className={styles.page}>
      <BackHeader title="Mentions" fallback="/settings" />
      <MentionsList />
    </div>
  )
}
