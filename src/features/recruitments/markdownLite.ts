/**
 * "Markdown-lite" — the description grammar, and nothing beyond it.
 *
 * WHY THIS AND NOT A MARKDOWN LIBRARY
 * The description is stored as PLAIN TEXT and always will be: a TextField,
 * no HTML, no sanitizer to keep honest, no new XSS surface. What is missing is
 * only that a pasted description arrives flattened — paragraph gaps gone,
 * bullets and bold lost. That is a five-rule problem, and five rules do not
 * need a general-purpose parser whose grammar (raw HTML, links, images,
 * autolinks, reference definitions) is far larger than what may be rendered.
 *
 * THE OUTPUT IS DATA, NOT HTML.
 * This module returns a block tree; `MarkdownLite` turns it into React
 * elements. Nothing here produces an HTML string, and nothing downstream is
 * allowed to use `dangerouslySetInnerHTML` — that is what makes the whole
 * feature safe by construction rather than by a sanitizer that has to be
 * right every time.
 *
 * THE GRAMMAR, in full:
 *   blank line         → paragraph break
 *   single newline     → line break inside the paragraph
 *   "- " / "* " line   → unordered list item
 *   "1. " line         → ordered list item
 *   **text**           → bold
 *   *text* / _text_    → italic
 *
 * No headings, no tables, no images, no raw HTML, no links (a bare URL renders
 * as the text it is). ANYTHING UNRECOGNISED IS LITERAL TEXT: "5 * 4 = 20" and
 * "that cost me *" render exactly as typed, because a stray asterisk in
 * ordinary prose is far more common than an intentional one.
 */

export type InlineNode =
    | { type: "text"; value: string }
    | { type: "bold"; children: InlineNode[] }
    | { type: "italic"; children: InlineNode[] }
    /** A single newline inside a paragraph. */
    | { type: "break" }

export type Block =
    | { type: "paragraph"; children: InlineNode[] }
    | ListBlock

export type ListBlock = {
    type: "list"
    ordered: boolean
    start: number
    items: InlineNode[][]
}

/** "- item" or "* item". The marker needs a space after it AND something
 *  after that, so neither a lone "*" nor a half-typed "- " becomes an empty
 *  bullet — and a sentence starting "*maybe*" is emphasis, not a list. */
const BULLET_RE = /^[ \t]*[-*][ \t]+(\S.*)$/
/** "1. item". The number is kept so a list starting at 3 still starts at 3. */
const ORDERED_RE = /^[ \t]*(\d{1,9})\.[ \t]+(\S.*)$/

/**
 * Emphasis, matched left to right in ONE pass so `**` always wins over `*`.
 *
 * Every alternative demands a non-space immediately inside the delimiters
 * (`\S…\S`, or a single `\S`). That one requirement is what keeps prose safe:
 * "2 * 3 * 4" has a space after each opening `*`, so none of it matches and
 * all of it renders literally. An unclosed `**bold` matches nothing either,
 * and falls through as text.
 */
const INLINE_RE =
    /\*\*(\S|\S[\s\S]*?\S)\*\*|\*(\S|\S[^*\n]*?\S)\*|_(\S|\S[^_\n]*?\S)_/

/** Emphasis may nest one level (`**bold with *italic* inside**`); beyond that
 *  the inner text is taken literally rather than recursed forever. */
const MAX_INLINE_DEPTH = 4

function parseInline(text: string, depth = 0): InlineNode[] {
    const out: InlineNode[] = []
    let rest = text

    if (depth >= MAX_INLINE_DEPTH) {
        return text ? [{ type: "text", value: text }] : []
    }

    while (rest) {
        const match = INLINE_RE.exec(rest)
        if (!match) break

        if (match.index > 0) {
            out.push({ type: "text", value: rest.slice(0, match.index) })
        }

        const [whole, bold, star, underscore] = match
        if (bold !== undefined) {
            out.push({ type: "bold", children: parseInline(bold, depth + 1) })
        } else {
            const inner = star !== undefined ? star : underscore
            out.push({ type: "italic", children: parseInline(inner, depth + 1) })
        }

        rest = rest.slice(match.index + whole.length)
    }

    if (rest) out.push({ type: "text", value: rest })
    return out
}

/** The lines of one paragraph, joined by explicit `break` nodes. */
function paragraphFrom(lines: string[]): Block {
    const children: InlineNode[] = []
    lines.forEach((line, i) => {
        if (i > 0) children.push({ type: "break" })
        children.push(...parseInline(line))
    })
    return { type: "paragraph", children }
}

/**
 * Text → blocks. Total: every input produces a valid tree, and no input
 * throws.
 */
export function parseMarkdownLite(text: string): Block[] {
    if (!text) return []

    const lines = text.replace(/\r\n?/g, "\n").split("\n")
    const blocks: Block[] = []

    // Exactly one of these is open at a time.
    let paragraph: string[] = []
    let list: ListBlock | null = null

    const closeParagraph = () => {
        if (paragraph.length) blocks.push(paragraphFrom(paragraph))
        paragraph = []
    }
    const closeList = () => {
        if (list) blocks.push(list)
        list = null
    }

    for (const line of lines) {
        if (!line.trim()) {
            // A blank line ends whatever is open. Runs of them collapse to one
            // break: the gap is a paragraph boundary, not a unit of height.
            closeParagraph()
            closeList()
            continue
        }

        const bullet = BULLET_RE.exec(line)
        const ordered = bullet ? null : ORDERED_RE.exec(line)
        const item = bullet ? bullet[1] : ordered?.[2]

        if (item !== undefined) {
            closeParagraph()
            const isOrdered = ordered !== null
            // A switch of list type starts a NEW list rather than mixing
            // markers inside one — <ul> and <ol> are different elements.
            if (list && list.ordered !== isOrdered) closeList()
            const open: ListBlock = list ?? {
                type: "list",
                ordered: isOrdered,
                start: ordered ? Number(ordered[1]) : 1,
                items: [],
            }
            open.items.push(parseInline(item.trim()))
            list = open
            continue
        }

        // Ordinary prose. It cannot continue a list: a line under a bullet
        // that is not itself a bullet reads as a new paragraph, and guessing
        // at lazy continuation is exactly the kind of rule this grammar
        // exists to not have.
        closeList()
        paragraph.push(line)
    }

    closeParagraph()
    closeList()
    return blocks
}
