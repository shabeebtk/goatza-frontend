/**
 * The reading container for the four legal documents.
 *
 * A route group, so it adds this layout without adding a URL segment — the
 * pages stay at /terms, /privacy, /guidelines and /safety, which is where the
 * landing footer, the signup form and the backend's RESERVED_USERNAMES all
 * already expect them.
 *
 * Inside `(public)` deliberately: its layout is a server component and is NOT
 * wrapped in AuthGuard, which would bounce a logged-out visitor to /auth — the
 * exact opposite of what a legal page is for. Nothing here is a client
 * component either, so these pages render fully with JavaScript switched off.
 */

import styles from "./layout.module.css"

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className={styles.page}>{children}</div>
}
