/** The one-tap ways back to whoever sent an enquiry. */

import { describe, expect, it } from "vitest"

import { telHref, whatsappGreeting, whatsappHref } from "./contactLinks"

describe("telHref and whatsappHref", () => {
  it("dials the E.164 number", () => {
    expect(telHref("+919876543210")).toBe("tel:+919876543210")
    expect(telHref("+91 98765 43210")).toBe("tel:+919876543210")
  })

  it("opens wa.me with the digits only and the text encoded", () => {
    expect(whatsappHref("+919876543210", "Hi Meera, this is A & B.")).toBe(
      "https://wa.me/919876543210?text=Hi%20Meera%2C%20this%20is%20A%20%26%20B."
    )
    expect(whatsappHref("+919876543210", "")).toBe("https://wa.me/919876543210")
  })
})

describe("whatsappGreeting", () => {
  const child = {
    for_whom: "child" as const,
    player_name: "Aditya Nair",
    guardian_name: "Meera Nair",
    program_name: "U12 Football Foundation",
  }

  it("greets the parent of a child, by first name, and names the program", () => {
    expect(whatsappGreeting({ enquiry: child, orgName: "Thrissur Tigers" })).toBe(
      "Hi Meera, this is Thrissur Tigers about your enquiry for U12 Football Foundation."
    )
  })

  it("greets the player themselves, and a general enquiry is about joining", () => {
    expect(
      whatsappGreeting({
        enquiry: { for_whom: "self", player_name: "Rahul K", guardian_name: "", program_name: "" },
        orgName: "Thrissur Tigers",
      })
    ).toBe("Hi Rahul, this is Thrissur Tigers about your enquiry for joining.")
  })
})
