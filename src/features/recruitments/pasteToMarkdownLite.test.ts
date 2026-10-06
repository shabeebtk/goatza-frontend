/**
 * @vitest-environment jsdom
 *
 * The paste handler: a description written in Word, Docs or WhatsApp arrives
 * as `text/html`, and a textarea would throw all of it away. These tests pin
 * the conversion INTO the grammar — and pin the thing that makes it safe,
 * which is that the output is plain text. No markup from another application
 * survives this function; only its structure does.
 *
 * jsdom, because the conversion reads the clipboard's HTML through DOMParser.
 */

import { describe, expect, it } from "vitest"

import {
    clipboardToMarkdownLite,
    htmlToMarkdownLite,
    normalizePastedText,
} from "./pasteToMarkdownLite"
import { parseMarkdownLite } from "./markdownLite"

/** Just enough DataTransfer for the handler: it only ever reads two flavours. */
function clipboard(flavours: { html?: string; plain?: string }): DataTransfer {
    return {
        getData: (type: string) =>
            (type === "text/html" ? flavours.html : flavours.plain) ?? "",
    } as unknown as DataTransfer
}

describe("normalizePastedText", () => {
    it("turns non-breaking spaces into ordinary ones", () => {
        // An nbsp before a marker is why a pasted bullet stops being a bullet.
        expect(normalizePastedText("\u00A0- Boots")).toBe("- Boots")
        expect(normalizePastedText("Two\u00A0hours")).toBe("Two hours")
    })

    it("straightens smart quotes", () => {
        expect(normalizePastedText("\u201CBring\u201D the \u2018right\u2019 boots"))
            .toBe('"Bring" the \'right\' boots')
    })

    it("strips trailing spaces and collapses a run of blank lines", () => {
        expect(normalizePastedText("A   \n   \n\n\n\nB  ")).toBe("A\n\nB")
    })

    it("normalises CRLF and trims the ends", () => {
        expect(normalizePastedText("\n\n  A\r\nB  \n\n")).toBe("A\nB")
    })
})

describe("htmlToMarkdownLite", () => {
    it("<b>/<strong> become ** and <i>/<em> become *", () => {
        expect(htmlToMarkdownLite("<p><b>Boots</b> are <em>required</em></p>"))
            .toBe("**Boots** are *required*")
        expect(htmlToMarkdownLite("<p><strong>A</strong> and <i>b</i></p>"))
            .toBe("**A** and *b*")
    })

    it("keeps the space an inline tag was carrying", () => {
        expect(htmlToMarkdownLite("<p><b>Boots </b>required</p>")).toBe("**Boots** required")
        // Word emits empty bold runs freely; they must not leave "** **".
        expect(htmlToMarkdownLite("<p>A<b> </b>B</p>")).toBe("A B")
    })

    it("<li> becomes a bullet, and an <ol> keeps its numbering", () => {
        expect(htmlToMarkdownLite("<ul><li>Boots</li><li>Water</li></ul>"))
            .toBe("- Boots\n- Water")
        expect(htmlToMarkdownLite("<ol><li>Warm-up</li><li>Drills</li></ol>"))
            .toBe("1. Warm-up\n2. Drills")
        expect(htmlToMarkdownLite('<ol start="3"><li>Match</li></ol>')).toBe("3. Match")
    })

    it("<p> is a paragraph break and <br> is a line break", () => {
        expect(htmlToMarkdownLite("<p>One</p><p>Two</p>")).toBe("One\n\nTwo")
        expect(htmlToMarkdownLite("<p>One<br>two</p>")).toBe("One\ntwo")
        // Chat clients wrap each visual line in a div — that is a LINE, not a
        // paragraph, and inserting a blank line would be a gap nobody typed.
        expect(htmlToMarkdownLite("<div>One</div><div>Two</div>")).toBe("One\nTwo")
    })

    it("discards every other element to its text — no markup survives", () => {
        expect(
            htmlToMarkdownLite(
                '<h2>Trials</h2><p>See <a href="https://x.example">our site</a>' +
                '<img src="x.png"><span style="color:red"> today</span></p>',
            ),
        ).toBe("Trials\n\nSee our site today")

        // The output is TEXT. A script in the clipboard contributes nothing,
        // and a tag that reaches the description does so as characters.
        const hostile = htmlToMarkdownLite(
            '<script>alert(1)</script><p>Hi<style>b{}</style></p>',
        )
        expect(hostile).toBe("Hi")
        expect(htmlToMarkdownLite("<p>&lt;img onerror=x&gt;</p>")).toBe("<img onerror=x>")
    })

    it("a Word-shaped paste lands as the blocks it looked like", () => {
        const pasted = htmlToMarkdownLite(
            "<p><b>What\u00A0to bring</b></p><ul><li>Boots</li><li>Water</li></ul>" +
            "<p>See you \u201Cthere\u201D.</p>",
        )
        expect(pasted).toBe('**What to bring**\n\n- Boots\n- Water\n\nSee you "there".')
        expect(parseMarkdownLite(pasted).map((b) => b.type))
            .toEqual(["paragraph", "list", "paragraph"])
    })
})

describe("clipboardToMarkdownLite", () => {
    it("prefers text/html when the clipboard offers it", () => {
        expect(clipboardToMarkdownLite(clipboard({
            html: "<ul><li>Boots</li></ul>",
            plain: "Boots",
        }))).toBe("- Boots")
    })

    it("falls back to text/plain, normalised the same way", () => {
        expect(clipboardToMarkdownLite(clipboard({ plain: "A   \n\n\n\nB\u00A0c" })))
            .toBe("A\n\nB c")
    })

    it("answers null when there is nothing to paste, so the browser handles it", () => {
        expect(clipboardToMarkdownLite(clipboard({}))).toBeNull()
        expect(clipboardToMarkdownLite(clipboard({ html: "   " }))).toBeNull()
    })
})
