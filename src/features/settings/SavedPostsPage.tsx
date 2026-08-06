"use client"

/**
 * Settings → Saved posts. The signed-in PERSON's saves; OrgSavedPostsPage is
 * the org-admin twin, where the actor headers make it the org's.
 */

import { BackHeader } from "@/shared/components/ui"
import SavedPostsList from "@/features/posts/components/SavedPostsList/SavedPostsList"
import styles from "./ContentPage.module.css"

export default function SavedPostsPage() {
  return (
    <div className={styles.page}>
      <BackHeader title="Saved posts" fallback="/settings" />
      <SavedPostsList />
    </div>
  )
}
