/**
 * Renders one legal document: header, body, and links to the other three.
 *
 * COLOCATED with the route group rather than living in `src/features/legal/`,
 * which is the usual home for real code. There is no feature here — no hooks,
 * no api calls, no state, nothing a second caller could reuse — only the markup
 * that goes with `layout.module.css`. Splitting the two across folders would
 * mean the component and the stylesheet that defines its prose could drift
 * apart for no benefit.
 *
 * A server component with no interactivity, so the four pages ship no
 * JavaScript of their own and read correctly with JS disabled.
 */

import Link from "next/link"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  formatLegalDate,
  getLegalDocument,
  stripDocumentHeading,
  type LegalSlug,
} from "@/shared/services/legal"

import styles from "./layout.module.css"

/**
 * Route → label, and the order the footer lists them in: the two that gate the
 * product first, then the two that explain how it is run.
 */
const LEGAL_NAV: { slug: LegalSlug; href: string; label: string }[] = [
  { slug: "terms", href: "/terms", label: "Terms of Service" },
  { slug: "privacy", href: "/privacy", label: "Privacy Policy" },
  { slug: "guidelines", href: "/guidelines", label: "Community Guidelines" },
  { slug: "safety", href: "/safety", label: "Youth Safety" },
]

export default function LegalDocumentView({ slug }: { slug: LegalSlug }) {
  const document = getLegalDocument(slug)
  const others = LEGAL_NAV.filter((entry) => entry.slug !== slug)

  return (
    <article className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{document.title}</h1>
        <p className={styles.meta}>
          Version {document.version}
          <span className={styles.metaDivider} aria-hidden="true">
            ·
          </span>
          Last updated{" "}
          <time dateTime={document.lastUpdated}>
            {formatLegalDate(document.lastUpdated)}
          </time>
        </p>
      </header>

      <div className={styles.prose}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            // The one element that cannot reflow. It scrolls inside its own
            // box so a wide retention table never makes the whole page
            // scroll sideways on a phone.
            table: ({ children, ...props }) => (
              <div className={styles.tableWrap}>
                <table {...props}>{children}</table>
              </div>
            ),
          }}
        >
          {stripDocumentHeading(document.content)}
        </Markdown>
      </div>

      <footer className={styles.footer}>
        <p className={styles.footerLabel}>The rest of our policies</p>
        <ul className={styles.footerLinks}>
          {others.map((entry) => (
            <li key={entry.slug}>
              <Link className={styles.footerLink} href={entry.href}>
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* The other place a logged-out person already lands. Not a policy, so
            not a chip — a quiet line under them. Someone reading Terms because
            something went wrong is one of the few people who will ever need
            this, and they have no session to report from. */}
        <p className={styles.footerNote}>
          Something on Goatza broken?{" "}
          <Link className={styles.footerNoteLink} href="/report-problem">
            Report a problem
          </Link>
        </p>
      </footer>
    </article>
  )
}
