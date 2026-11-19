// @vitest-environment jsdom
/**
 * The page's contact actions as drawn: wa.me / tel: / mailto: links named with
 * the org, the primary falling back to WhatsApp with the form off, the bar's
 * two extras, and nothing at all for the org's own admins.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import PageContactActions from "./PageContactActions"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))

const CONTACT = { enquiry_form: true, whatsapp: "+919876543210", call: "+919812345678", email: "hello@kannurfa.in" }

afterEach(cleanup)

describe("PageContactActions", () => {
  it("links WhatsApp, Call and Email, each named with the org", () => {
    render(<PageContactActions contact={CONTACT} orgName="Kannur FA" layout="header" />)

    const whatsapp = screen.getByRole("link", { name: "WhatsApp Kannur FA" })
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/)
    expect(whatsapp.getAttribute("target")).toBe("_blank")
    expect(whatsapp.getAttribute("rel")).toBe("noopener noreferrer")
    expect(screen.getByRole("link", { name: "Call Kannur FA" }).getAttribute("href")).toBe("tel:+919812345678")
    expect(screen.getByRole("link", { name: "Email Kannur FA" }).getAttribute("href")).toBe(
      "mailto:hello@kannurfa.in?subject=Enquiry%20from%20Goatza"
    )
  })

  it("puts Enquire now first while the form is on", () => {
    const { container } = render(<PageContactActions contact={CONTACT} orgName="Kannur FA" layout="header" />)

    const first = container.querySelector("button, a")!
    expect(first.tagName).toBe("BUTTON")
    expect(first.textContent).toBe("Enquire now")
  })

  it("makes WhatsApp the primary when the form is off", () => {
    const { container } = render(
      <PageContactActions contact={{ ...CONTACT, enquiry_form: false }} orgName="Kannur FA" layout="header" />
    )

    expect(screen.queryByRole("button", { name: /Enquire/ })).toBeNull()
    expect(container.querySelector("a")!.getAttribute("aria-label")).toBe("WhatsApp Kannur FA")
  })

  it("keeps the phone bar to the primary and two icon buttons", () => {
    render(<PageContactActions contact={CONTACT} orgName="Kannur FA" layout="bar" />)

    expect(screen.getByRole("button", { name: "Enquire now with Kannur FA" }).textContent).toBe("Enquire now")
    expect(screen.getByRole("link", { name: "WhatsApp Kannur FA" }).textContent).toBe("")
    expect(screen.getByRole("link", { name: "Call Kannur FA" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Email Kannur FA" })).toBeNull()
  })

  it("shows nothing to the org's own admins, or with nothing on", () => {
    const { container } = render(<PageContactActions contact={CONTACT} orgName="Kannur FA" layout="aside" isMe />)
    expect(container.innerHTML).toBe("")

    cleanup()
    const off = render(
      <PageContactActions
        contact={{ enquiry_form: false, whatsapp: null, call: null, email: null }}
        orgName="Kannur FA"
        layout="aside"
      />
    )
    expect(off.container.innerHTML).toBe("")
  })
})
