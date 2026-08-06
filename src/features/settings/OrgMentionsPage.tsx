"use client"

/**
 * Org-admin → Mentions. The same list and the same page frame as the personal
 * version — only the back destination differs, since this one is reached from
 * the gear on the org's profile rather than from personal settings.
 */

import { BackHeader } from "@/shared/components/ui"
import MentionsList from "@/features/posts/components/MentionsList/MentionsList"
import styles from "./ContentPage.module.css"

export default function OrgMentionsPage({ orgId }: { orgId: string }) {
  return (
    <div className={styles.page}>
      <BackHeader
        title="Mentions"
        fallback={`/organization/admin/${orgId}/settings`}
      />
      <MentionsList />
    </div>
  )
}
