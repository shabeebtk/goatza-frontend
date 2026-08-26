"use client"

/**
 * Settings → Blocked accounts. The ACTIVE ACTOR's blocks — the actor headers
 * already decide whose list comes back, so nothing is passed down.
 *
 * Same frame as SavedPostsPage: a BackHeader plus the feature's own list.
 */

import { BackHeader } from "@/shared/components/ui"
import BlockedAccountsList from "@/features/moderation/components/BlockedAccountsList/BlockedAccountsList"
import styles from "./ContentPage.module.css"

export default function BlockedAccountsPage() {
  return (
    <div className={styles.page}>
      <BackHeader title="Blocked accounts" fallback="/settings" />
      <BlockedAccountsList />
    </div>
  )
}
