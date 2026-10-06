/**
 * waLink — the one thing that turns a stored phone number into a link that
 * actually opens the right chat.
 *
 * The failure this guards against is silent: a malformed number produces a
 * wa.me URL that looks fine and opens a chat with nobody, and the sender
 * finds out when the player says they never got it.
 */

import { describe, expect, it } from "vitest"

import { waLink, waPhone } from "./waLink"

describe("waPhone", () => {
    it("adds the country code to a bare 10-digit Indian mobile", () => {
        expect(waPhone("9876543210")).toBe("919876543210")
    })

    it("strips whatever separators the number was typed with", () => {
        expect(waPhone("98765 43210")).toBe("919876543210")
        expect(waPhone("+91 98765-43210")).toBe("919876543210")
        expect(waPhone("(98765) 43210")).toBe("919876543210")
    })

    it("leaves a number that already carries a country code alone", () => {
        expect(waPhone("919876543210")).toBe("919876543210")
        expect(waPhone("+44 7700 900123")).toBe("447700900123")
    })

    it("refuses anything that cannot be a phone number", () => {
        // Too short to be one — better no recipient than the wrong one.
        expect(waPhone("12345")).toBe("")
        expect(waPhone("")).toBe("")
        expect(waPhone(null)).toBe("")
        expect(waPhone(undefined)).toBe("")
        expect(waPhone("not a number")).toBe("")
    })
})

describe("waLink", () => {
    it("builds a link to one recipient", () => {
        expect(waLink("9876543210", "hello")).toBe(
            "https://wa.me/919876543210?text=hello",
        )
    })

    it("falls back to the share sheet when there is no usable number", () => {
        // A link with no recipient still works — WhatsApp asks who to send to.
        // A link with a BROKEN recipient does not, which is why junk lands
        // here rather than in the number.
        expect(waLink(null, "hello")).toBe("https://wa.me/?text=hello")
        expect(waLink("12345", "hello")).toBe("https://wa.me/?text=hello")
    })

    it("encodes the text, newlines and all", () => {
        const link = waLink("9876543210", "Venue moved\nGate 3 & car park")
        expect(link).toContain("Venue%20moved%0AGate%203%20%26%20car%20park")
        // The separator must survive: an unencoded & would truncate the text.
        expect(link.split("?text=")).toHaveLength(2)
    })
})
