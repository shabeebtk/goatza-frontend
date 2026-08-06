"use client"

/**
 * Org-admin → Saved posts. Twin of the personal page; the actor headers the
 * org-admin shell sends are what make this the ORG's list.
 */

import { BackHeader } from "@/shared/components/ui"
import SavedPostsList from "@/features/posts/components/SavedPostsList/SavedPostsList"
import styles from "./ContentPage.module.css"

export default function OrgSavedPostsPage({ orgId }: { orgId: string }) {
  return (
    <div className={styles.page}>
      <BackHeader
        title="Saved posts"
        fallback={`/organization/admin/${orgId}/settings`}
      />
      <SavedPostsList />
    </div>
  )
}
