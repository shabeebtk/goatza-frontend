/**
 * Building a wa.me link.
 *
 * WHATSAPP IS THE FALLBACK, NEVER THE DEFAULT. Every placement of these links
 * sits SECOND to a Goatza action — "Message on Goatza" first, the WhatsApp
 * icon after it. Routing a trial update to WhatsApp hands the org the player's
 * phone number and gives neither of them a reason to come back; it earns its
 * place only where Goatza genuinely cannot reach (a parent with no account, a
 * group chat the team already lives in).
 *
 * The wording lives in `whatsappTemplates.ts`, not here and not in components,
 * so it can be tuned in one file.
 */

/** India. Every number on this product is entered without a country code. */
const DEFAULT_COUNTRY_CODE = "91"

/**
 * A phone number as wa.me wants it: digits only, country code included.
 *
 * Returns "" for anything that cannot be one, which is the signal to build a
 * link with no recipient — WhatsApp then opens the share sheet and the sender
 * picks the chat. That is a WORSE experience but never a broken one, and a
 * broken deep link is the failure mode this guards against.
 */
export function waPhone(phone?: string | null): string {
    const digits = (phone ?? "").replace(/\D/g, "")
    if (!digits) return ""

    // A bare 10-digit Indian mobile. Anything longer already carries a country
    // code (or is a number we should not guess at), and anything shorter is
    // not a phone number.
    if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`

    // A 12-digit number starting 91 is already complete; so is anything else
    // long enough to be international. Pass it through rather than mangling it.
    return digits.length >= 11 ? digits : ""
}

/**
 * `https://wa.me/<number>?text=<message>`, or the recipient-less form when
 * there is no usable number.
 *
 * `text` is always encoded here so no caller has to remember to.
 */
export function waLink(phone: string | null | undefined, text: string): string {
    const number = waPhone(phone)
    const encoded = encodeURIComponent(text)
    return number
        ? `https://wa.me/${number}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`
}
