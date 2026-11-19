// @vitest-environment jsdom
/**
 * The phone's Enquire bar: only on a phone and only with a contact action,
 * hidden (and out of reach) until the header's action row has scrolled away,
 * hidden again while the sheet is open, and it never traps focus.
 */

import { useRef } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE, LOCATIONS } from "@/features/orgPage/__fixtures__/pageShowcase"
import { EnquiryProvider } from "../../EnquiryContext"
import EnquireBar from "./EnquireBar"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/profile/kannurfa",
}))

let headerCallback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null

class FakeObserver {
  constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    headerCallback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

let phone = true

const ORG = { id: "org-1", username: "kannurfa", name: "Kannur FA", logo: "", type: "academy", locations: LOCATIONS, isFollowing: false }

function Page({ contact = ACADEMY_PAGE.contact }: { contact?: typeof ACADEMY_PAGE.contact }) {
  const headerRef = useRef<HTMLDivElement | null>(null)
  return (
    <EnquiryProvider page={{ ...ACADEMY_PAGE, contact }} org={ORG} anonymous>
      <div ref={headerRef} />
      <EnquireBar contact={contact} orgName="Kannur FA" headerRef={headerRef} />
    </EnquiryProvider>
  )
}

const bar = () => document.querySelector("[data-enquire-bar]") as HTMLElement | null

const scrollHeaderAway = () =>
  act(() =>
    headerCallback!([
      {
        isIntersecting: false,
        boundingClientRect: { bottom: -10 } as DOMRectReadOnly,
        rootBounds: { top: 56 } as DOMRectReadOnly,
      },
    ])
  )

beforeEach(() => {
  phone = true
  headerCallback = null
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px") ? phone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe("EnquireBar", () => {
  it("is hidden and out of reach until the header has scrolled away", () => {
    render(<Page />)

    expect(bar()!.getAttribute("aria-hidden")).toBe("true")
    expect(bar()!.hasAttribute("inert")).toBe(true)

    scrollHeaderAway()

    expect(bar()!.hasAttribute("aria-hidden")).toBe(false)
    expect(bar()!.hasAttribute("inert")).toBe(false)
    expect(screen.getByRole("button", { name: "Enquire now with Kannur FA" })).toBeTruthy()
    // Up to two more as icon buttons.
    expect(screen.getByRole("link", { name: "WhatsApp Kannur FA" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Call Kannur FA" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Email Kannur FA" })).toBeNull()
  })

  it("steps aside while the enquiry sheet is open", () => {
    render(<Page />)
    scrollHeaderAway()

    fireEvent.click(screen.getByRole("button", { name: "Enquire now with Kannur FA" }))

    expect(screen.getByRole("dialog", { name: "Enquire" })).toBeTruthy()
    expect(bar()!.getAttribute("aria-hidden")).toBe("true")
  })

  it("isn't there on desktop, or without a contact action", () => {
    phone = false
    render(<Page />)
    expect(bar()).toBeNull()

    cleanup()
    phone = true
    render(<Page contact={{ enquiry_form: false, whatsapp: null, call: null, email: null }} />)
    expect(bar()).toBeNull()
  })
})
