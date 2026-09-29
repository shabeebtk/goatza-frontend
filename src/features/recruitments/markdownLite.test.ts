/**
 * The description grammar, and its edges.
 *
 * The parser is the safety story for fix 6: the description stays plain text,
 * and what renders it returns React ELEMENTS built here — no HTML string ever
 * exists, so there is nothing to sanitize. These tests pin the five rules and,
 * just as importantly, pin what must NOT be a rule: a stray asterisk in
 * ordinary prose is far more common than an intentional one, and it must
 * render as the character it is.
 */

import { describe, expect, it } from "vitest"

import { parseMarkdownLite, type Block, type InlineNode } from "./markdownLite"

/** The rendered text of a block, markers dropped — what a reader would see. */
function textOf(nodes: InlineNode[]): string {
    return nodes
        .map((node) => {
            switch (node.type) {
                case "text": return node.value
                case "break": return "\n"
                default: return textOf(node.children)
            }
        })
        .join("")
}

const paragraphs = (blocks: Block[]) =>
    blocks.filter((b): b is Extract<Block, { type: "paragraph" }> => b.type === "paragraph")

describe("parseMarkdownLite — paragraphs and breaks", () => {
    it("a blank line is a paragraph break; a single newline is a line break", () => {
        const blocks = parseMarkdownLite("One\ntwo\n\nThree")

        expect(blocks).toHaveLength(2)
        expect(blocks[0]).toEqual({
            type: "paragraph",
            children: [
                { type: "text", value: "One" },
                { type: "break" },
                { type: "text", value: "two" },
            ],
        })
        expect(textOf(paragraphs(blocks)[1].children)).toBe("Three")
    })

    it("a run of blank lines is still one break, and empty text is no blocks", () => {
        expect(parseMarkdownLite("A\n\n\n\n\nB")).toHaveLength(2)
        expect(parseMarkdownLite("")).toEqual([])
        expect(parseMarkdownLite("   \n\n  ")).toEqual([])
    })

    it("normalises CRLF, so a Windows paste is not one long line", () => {
        expect(parseMarkdownLite("A\r\n\r\nB")).toHaveLength(2)
    })
})

describe("parseMarkdownLite — emphasis", () => {
    it("**text** is bold and *text* / _text_ are italic", () => {
        expect(parseMarkdownLite("**Trials** are *free* and _open_")).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "bold", children: [{ type: "text", value: "Trials" }] },
                    { type: "text", value: " are " },
                    { type: "italic", children: [{ type: "text", value: "free" }] },
                    { type: "text", value: " and " },
                    { type: "italic", children: [{ type: "text", value: "open" }] },
                ],
            },
        ])
    })

    it("bold wins over italic, and nests one level", () => {
        const [block] = parseMarkdownLite("**bold with *italic* inside**")
        expect(block).toEqual({
            type: "paragraph",
            children: [
                {
                    type: "bold",
                    children: [
                        { type: "text", value: "bold with " },
                        { type: "italic", children: [{ type: "text", value: "italic" }] },
                        { type: "text", value: " inside" },
                    ],
                },
            ],
        })
    })

    // The rule this grammar exists to have: anything unrecognised is literal.
    it("a stray asterisk is text, and never breaks the render", () => {
        for (const line of [
            "Bring 2 * 3 sets of kit",
            "Ask for the coach *",
            "**unclosed bold and more text",
            "* ",
            "*",
            "a ** b",
            "5*4=20",
        ]) {
            const blocks = parseMarkdownLite(line)
            // Whatever it parsed to, the reader sees exactly what was typed.
            expect(paragraphs(blocks).map((b) => textOf(b.children)).join("")).toBe(line)
            expect(blocks.some((b) => b.type === "list")).toBe(false)
        }
    })
})

describe("parseMarkdownLite — lists", () => {
    it('"- " and "* " lines are one unordered list', () => {
        expect(parseMarkdownLite("- Boots\n* Shin pads")).toEqual([
            {
                type: "list",
                ordered: false,
                start: 1,
                items: [
                    [{ type: "text", value: "Boots" }],
                    [{ type: "text", value: "Shin pads" }],
                ],
            },
        ])
    })

    it('"1. " lines are an ordered list that keeps its first number', () => {
        const [block] = parseMarkdownLite("3. Warm-up\n4. Drills")
        expect(block).toMatchObject({ type: "list", ordered: true, start: 3 })
        expect((block as Extract<Block, { type: "list" }>).items).toHaveLength(2)
    })

    it("switching marker type starts a new list; prose after one ends it", () => {
        const blocks = parseMarkdownLite("- Boots\n1. Warm-up\nThen we play")
        expect(blocks.map((b) => b.type)).toEqual(["list", "list", "paragraph"])
        expect(blocks[0]).toMatchObject({ ordered: false })
        expect(blocks[1]).toMatchObject({ ordered: true })
    })

    it("list items carry emphasis too", () => {
        const [block] = parseMarkdownLite("- **Boots** required")
        expect((block as Extract<Block, { type: "list" }>).items[0]).toEqual([
            { type: "bold", children: [{ type: "text", value: "Boots" }] },
            { type: "text", value: " required" },
        ])
    })

    it("a real description parses into the blocks it looks like", () => {
        const blocks = parseMarkdownLite(
            "**What to expect**\nTwo hours of drills.\n\nBring:\n- Boots\n- Water\n\nSee you there.",
        )
        expect(blocks.map((b) => b.type)).toEqual([
            "paragraph", "paragraph", "list", "paragraph",
        ])
    })
})
