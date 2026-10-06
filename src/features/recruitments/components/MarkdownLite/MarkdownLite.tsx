import type { ReactNode } from "react"
import { parseMarkdownLite, type Block, type InlineNode } from "../../markdownLite"
import styles from "./MarkdownLite.module.css"

/**
 * The description, rendered from the markdown-lite grammar to REACT ELEMENTS.
 *
 * There is no `dangerouslySetInnerHTML` here and there must never be one: the
 * stored value is plain text the org typed, every node below is built by this
 * file, and so the worst a hostile description can do is render as the text it
 * is. See `markdownLite.ts` for the grammar and why it is this small.
 *
 * Used by the authenticated detail page, the public /r/<id> view and the
 * wizard's own preview, so what the org approves is what gets published —
 * the same principle as the media preview's frame.
 */
export default function MarkdownLite({ text, className }: {
    text: string
    /** Typography for the surface (size, colour). Layout lives in this file's
     *  own CSS so the three surfaces cannot drift apart. */
    className?: string
}) {
    const blocks = parseMarkdownLite(text)
    if (blocks.length === 0) return null

    return (
        <div className={className ? `${styles.root} ${className}` : styles.root}>
            {blocks.map((block, i) => renderBlock(block, i))}
        </div>
    )
}

function renderBlock(block: Block, key: number): ReactNode {
    if (block.type === "list") {
        const items = block.items.map((item, i) => (
            <li key={i} className={styles.li}>{renderInline(item)}</li>
        ))
        return block.ordered
            ? <ol key={key} className={styles.list} start={block.start}>{items}</ol>
            : <ul key={key} className={styles.list}>{items}</ul>
    }
    return <p key={key} className={styles.p}>{renderInline(block.children)}</p>
}

function renderInline(nodes: InlineNode[]): ReactNode[] {
    return nodes.map((node, i) => {
        switch (node.type) {
            case "text":
                // A bare string: React needs no key for one, and an extra
                // wrapper element would only get in the way of wrapping.
                return node.value
            case "bold":
                return <strong key={i}>{renderInline(node.children)}</strong>
            case "italic":
                return <em key={i}>{renderInline(node.children)}</em>
            case "break":
                return <br key={i} />
        }
    })
}
