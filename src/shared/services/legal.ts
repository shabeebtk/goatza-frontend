/**
 * The four legal documents, read off disk.
 *
 * SERVER ONLY. This uses node's fs, so importing it from a client component is
 * a build error rather than a runtime surprise — which is the point. The
 * documents are static text that changes a few times a year; they belong in the
 * bundle Vercel builds, not behind a request.
 *
 * ── Why the version lives here AND in the markdown ───────────────
 *
 * `LEGAL_DOCUMENT_VERSION` is the number the app agrees on; each file's
 * frontmatter `version` is the number printed on the document itself. They are
 * two different claims and they must match — a page that renders "Version
 * 2026-10-01" while the consent gate is asking about a different version is a
 * consent record that means nothing.
 *
 * `legal.test.ts` is what keeps them together. It reads all four files and
 * fails if any frontmatter version drifts from the constant.
 *
 * ── Why nothing here talks to the backend ────────────────────────
 *
 * The backend owns the same version string (legal/constants.py) and serves it
 * at GET legal/versions. It is tempting to fetch that at build time and compare.
 * Don't. The API runs on Render, which sleeps, and a Vercel build that fails
 * because an unrelated service was cold is a deploy blocked for a reason that
 * has nothing to do with the deploy. The two sides are kept in step by being
 * bumped together, and the test catches the frontend half.
 */

import fs from "node:fs"
import path from "node:path"

import matter from "gray-matter"

/**
 * The version of the documents this build ships. Bumping legal text means
 * changing this, the four frontmatter blocks, and the backend's
 * legal/constants.py — in the same change.
 */
export const LEGAL_DOCUMENT_VERSION = "2026-10-01"

/**
 * Route segment → file. The keys are the URLs (/terms, /privacy, …) and the
 * values are the filenames, because the two deliberately differ: the routes are
 * short enough to type and say out loud, the filenames say what the document
 * actually is.
 *
 * Every key here is also in the backend's RESERVED_USERNAMES. It has to be —
 * `src/app/[username]/page.tsx` catches unmatched paths as profiles, and a
 * static route wins, so a user holding @terms would have an unreachable
 * profile.
 */
export const LEGAL_DOCUMENTS = {
  terms: "terms-of-service",
  privacy: "privacy-policy",
  guidelines: "community-guidelines",
  safety: "youth-safety",
} as const

export type LegalSlug = keyof typeof LEGAL_DOCUMENTS

export type LegalDocument = {
  title: string
  version: string
  lastUpdated: string
  content: string
}

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "legal")

export function legalFilePath(slug: LegalSlug): string {
  return path.join(CONTENT_DIR, `${LEGAL_DOCUMENTS[slug]}.md`)
}

/**
 * One document, parsed. Throws if the file is missing or its frontmatter is
 * incomplete.
 *
 * THROWING IS DELIBERATE. This runs at build time, where a hard failure is a
 * red deploy someone fixes in minutes. The alternative — returning null and
 * rendering an empty page — ships a live /terms that says nothing, which is
 * worse than not shipping.
 */
export function getLegalDocument(slug: LegalSlug): LegalDocument {
  const file = legalFilePath(slug)
  const raw = fs.readFileSync(file, "utf8")
  const { data, content } = matter(raw)

  const title = typeof data.title === "string" ? data.title : ""
  const version = typeof data.version === "string" ? data.version : ""
  const lastUpdated =
    typeof data.last_updated === "string" ? data.last_updated : ""

  if (!title || !version || !lastUpdated) {
    throw new Error(
      `Legal document "${slug}" is missing frontmatter ` +
        `(title/version/last_updated) in ${file}`,
    )
  }

  return { title, version, lastUpdated, content }
}

/**
 * The document body with its own title block removed.
 *
 * Every file opens with an H1 and, under it, a bold "Version … · …" line. The
 * page renders BOTH of those from frontmatter — which is the half the version
 * test guards — so leaving them in the body would print the title twice and
 * the version twice, and give the page two H1s.
 *
 * Strictly conditional: it removes a leading `# …` and, only if the very next
 * paragraph starts with `**Version`, that too. A document pasted without
 * either keeps everything it came with.
 */
export function stripDocumentHeading(content: string): string {
  const withoutTitle = content.replace(/^\s*#[^\S\n]+[^\n]*\n+/, "")

  // The version line is not always the first thing under the title —
  // youth-safety.md carries a subtitle above it ("A guide for parents…"),
  // which is content and has to stay. So the search is bounded to the
  // PREAMBLE: everything before the first `##` heading or `---` rule. Nothing
  // in the document body can be touched by it, however it is written.
  const boundary = withoutTitle.search(/^(##|---)/m)
  const end = boundary === -1 ? withoutTitle.length : boundary

  const preamble = withoutTitle
    .slice(0, end)
    .replace(/^\*\*Version[^\n]*\*\*[^\S\n]*\n+/m, "")

  return preamble + withoutTitle.slice(end)
}

/**
 * "2026-10-01" → "1 October 2026".
 *
 * Formatted here rather than with Intl in the page so the output cannot depend
 * on the server's locale — a date that renders differently on two machines is
 * a diff in the build output for no reason. Falls back to the raw string if it
 * is ever handed something that is not an ISO date.
 */
export function formatLegalDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value

  const [, year, month, day] = match
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  const name = months[Number(month) - 1]
  if (!name) return value

  return `${Number(day)} ${name} ${year}`
}
