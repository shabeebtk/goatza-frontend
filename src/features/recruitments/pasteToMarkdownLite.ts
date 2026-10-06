/**
 * Clipboard → the markdown-lite grammar.
 *
 * A description is usually written somewhere else first — Word, Google Docs,
 * a WhatsApp message — and pasted in. The clipboard carries that formatting as
 * `text/html`, which a textarea throws away: the org watches their bullets and
 * their bold turn into one flat run of text, with no way to get them back.
 *
 * So the paste is CONVERTED instead of discarded. The output is plain text in
 * the grammar `markdownLite.ts` renders — never HTML, which is the point: the
 * pasted markup is read for its structure and then dropped, so nothing from
 * another application is ever stored or rendered as markup.
 *
 * Parsing happens in a DETACHED document (`DOMParser`, `text/html`), which
 * runs no script, loads no image and is never attached to the page. Only tag
 * names and text are read out of it.
 */

/** Elements that separate PARAGRAPHS — a blank line, a real gap. */
const PARAGRAPH_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DL", "FIELDSET", "FIGURE",
    "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR",
    "MAIN", "NAV", "P", "PRE", "SECTION", "TABLE",
])

/** Elements that end a LINE inside the same paragraph. `<div>` is here on
 *  purpose: chat clients and mail wrap every visual line in one, and a blank
 *  line between each would be a gap the person pasting never typed. */
const LINE_TAGS = new Set([
    "DD", "DIV", "DT", "FIGCAPTION", "LI", "TD", "TH", "TR", "UL", "OL",
])

/** Never contributes text, however it got into the clipboard. */
const DROPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"])

const BOLD_TAGS = new Set(["B", "STRONG"])
const ITALIC_TAGS = new Set(["I", "EM"])

/**
 * Tidy text that is already in the grammar.
 *
 * - non-breaking spaces become ordinary ones (Word and Docs are full of them,
 *   and one in front of a "- " stops that line being read as a bullet)
 * - smart quotes become straight ones
 * - trailing spaces go: invisible, and they count toward the 3,000 limit
 * - a run of blank lines collapses to ONE. The grammar reads any run of blank
 *   lines as a single paragraph break, so the rest is height nobody asked for
 *   and characters charged against the limit.
 */
export function normalizePastedText(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/[\u00A0\u2007\u202F]/g, " ")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/**
 * `text/html` → the grammar, then the same normalisation.
 *
 * `<li>` becomes "- ", or "1. " inside an `<ol>` so a numbered list stays
 * numbered — pasting the same list as plain text keeps its numbers, and the
 * richer clipboard flavour must not be the one that loses them. `<b>`/`<strong>`
 * become `**`, `<i>`/`<em>` become `*`, `<p>` and `<br>` become newlines, and
 * every other element is discarded to its text content.
 */
export function htmlToMarkdownLite(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const out: string[] = []
    walk(doc.body, out, { ordinal: null })
    return normalizePastedText(out.join(""))
}

type WalkState = {
    /** The next number to write while inside an `<ol>`; null inside a `<ul>`. */
    ordinal: number | null
}

function walk(node: Node, out: string[], state: WalkState): void {
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* text */) {
            // Collapse whitespace the way the browser rendering it did:
            // structure comes from the tags, never from the source layout.
            out.push((child.nodeValue ?? "").replace(/\s+/g, " "))
            continue
        }
        if (child.nodeType !== 1 /* element */) continue

        const el = child as Element
        const tag = el.tagName.toUpperCase()

        if (DROPPED_TAGS.has(tag)) continue

        if (tag === "BR") {
            breakLine(out, 1)
            continue
        }

        if (tag === "OL" || tag === "UL") {
            breakLine(out, 1)
            walk(el, out, { ordinal: tag === "OL" ? startOf(el) : null })
            breakLine(out, 1)
            continue
        }

        if (tag === "LI") {
            breakLine(out, 1)
            if (state.ordinal === null) {
                out.push("- ")
            } else {
                out.push(`${state.ordinal}. `)
                state.ordinal += 1
            }
            // A list nested inside this item cannot be indented in a grammar
            // that has no nesting, so it flattens into the same list.
            walk(el, out, state)
            breakLine(out, 1)
            continue
        }

        const marker = BOLD_TAGS.has(tag) ? "**" : ITALIC_TAGS.has(tag) ? "*" : ""
        if (marker) {
            const inner: string[] = []
            walk(el, inner, state)
            const body = inner.join("")
            const core = body.trim()
            // Only wrap something. `<b> </b>`, which Word emits freely, would
            // otherwise leave a literal `** **` in the text. The delimiters go
            // INSIDE any surrounding space — the grammar refuses `** bold **`,
            // and `<b>Bold </b>text` must not lose the space it had.
            if (!core) {
                out.push(body)
            } else {
                const lead = body.slice(0, body.length - body.trimStart().length)
                const tail = body.slice(body.trimEnd().length)
                out.push(`${lead}${marker}${core}${marker}${tail}`)
            }
            continue
        }

        if (PARAGRAPH_TAGS.has(tag)) {
            breakLine(out, 2)
            walk(el, out, state)
            breakLine(out, 2)
            continue
        }

        if (LINE_TAGS.has(tag)) {
            breakLine(out, 1)
            walk(el, out, state)
            breakLine(out, 1)
            continue
        }

        // Everything else — <span>, <a>, <font>, <img>, an unknown custom
        // element — contributes its text and nothing else. A URL is text, not
        // a link: this grammar has none.
        walk(el, out, state)
    }
}

/** `<ol start="3">` keeps its numbering; anything else starts at 1. */
function startOf(el: Element): number {
    const raw = Number(el.getAttribute("start"))
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1
}

/**
 * End the current line with at least `count` newlines, without stacking
 * separators when two blocks close back to back. Nothing is emitted at the
 * very start, so the result never opens with blank lines.
 */
function breakLine(out: string[], count: number): void {
    while (out.length && /^[ \t]*$/.test(out[out.length - 1])) out.pop()
    if (!out.length) return

    let have = 0
    for (let i = out.length - 1; i >= 0; i--) {
        const match = /\n+$/.exec(out[i])
        if (!match) break
        have += match[0].length
        if (out[i].length > match[0].length) break
    }
    if (have < count) out.push("\n".repeat(count - have))
}

/**
 * The whole handler: read the richest flavour the clipboard offers and answer
 * with text in the grammar, or `null` when there is nothing to paste — in
 * which case the caller leaves the browser's own paste alone.
 */
export function clipboardToMarkdownLite(data: DataTransfer): string | null {
    const html = data.getData("text/html")
    if (html.trim()) {
        const converted = htmlToMarkdownLite(html)
        if (converted) return converted
    }
    const plain = data.getData("text/plain")
    if (!plain) return null
    return normalizePastedText(plain)
}
