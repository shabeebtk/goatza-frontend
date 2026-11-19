/**
 * The page's contact actions: their hrefs, the names that include the org, and
 * which one is the primary (the form, else the first of WhatsApp, Call, Email).
 */

import { describe, expect, it } from "vitest"

import { contactActions, hasContactAction, mailtoHref, pageWhatsappText, sentWhatsappText } from "./pageContact"

const ALL = { enquiry_form: true, whatsapp: "+919876543210", call: "+919812345678", email: "hello@kannurfa.in" }

describe("contactActions", () => {
  it("puts the form first, then WhatsApp, Call and Email, each naming the org", () => {
    const actions = contactActions(ALL, "Kannur FA")

    expect(actions.map((action) => action.key)).toEqual(["enquire", "whatsapp", "call", "email"])
    expect(actions.map((action) => action.ariaLabel)).toEqual([
      "Enquire now with Kannur FA",
      "WhatsApp Kannur FA",
      "Call Kannur FA",
      "Email Kannur FA",
    ])
  })

  it("builds the wa.me, tel: and mailto: links", () => {
    const [, whatsapp, call, email] = contactActions(ALL, "Kannur FA")

    expect(whatsapp.href).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent(
        "Hi Kannur FA, I found you on Goatza and I'd like to know more."
      )}`
    )
    expect(whatsapp.external).toBe(true)
    expect(call.href).toBe("tel:+919812345678")
    expect(email.href).toBe(`mailto:hello@kannurfa.in?subject=${encodeURIComponent("Enquiry from Goatza")}`)
  })

  it("makes WhatsApp the primary when the form is off", () => {
    expect(contactActions({ ...ALL, enquiry_form: false }, "Kannur FA")[0].key).toBe("whatsapp")
  })

  it("makes Call the primary with neither the form nor WhatsApp", () => {
    expect(contactActions({ ...ALL, enquiry_form: false, whatsapp: null }, "X")[0].key).toBe("call")
  })

  it("skips a blank number and offers nothing with everything off", () => {
    const off = { enquiry_form: false, whatsapp: "  ", call: null, email: "" }
    expect(contactActions(off, "X")).toEqual([])
    expect(hasContactAction(off)).toBe(false)
    expect(hasContactAction(null)).toBe(false)
    expect(hasContactAction(ALL)).toBe(true)
  })
})

describe("the WhatsApp lines", () => {
  it("opens from the page and after sending, with the player's first name", () => {
    expect(pageWhatsappText(" Kannur FA ")).toBe("Hi Kannur FA, I found you on Goatza and I'd like to know more.")
    expect(sentWhatsappText("Kannur FA", "Aditya Menon")).toBe(
      "Hi Kannur FA, I just sent an enquiry on Goatza about Aditya."
    )
  })

  it("trims the address in a mailto", () => {
    expect(mailtoHref(" a@b.in ")).toBe(`mailto:a@b.in?subject=${encodeURIComponent("Enquiry from Goatza")}`)
  })
})
