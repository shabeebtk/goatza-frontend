"use client"

/**
 * Settings → Mentions. The signed-in PERSON's mentions; OrgMentionsPage is
 * the org-admin twin, where the actor headers make it the org's.
 */

import { BackHeader } from "@/shared/components/ui"
import MentionsList from "@/features/posts/components/MentionsList/MentionsList"
import styles from "./ContentPage.module.css"

export default function MentionsPage() {
  return (
    <div className={styles.page}>
      <BackHeader title="Mentions" fallback="/settings" />
      <MentionsList />
    </div>
  )
}
