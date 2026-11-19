// @vitest-environment jsdom
/**
 * About on the page: the facts show only when filled, the links open safely in
 * a new tab, and "Read more" appears only when the text really overflows.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ShowcaseFacts } from "../../types"
import AboutSection from "./AboutSection"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))

const FACTS: ShowcaseFacts = {
  founded_year: 2012,
  age_min: 6,
  age_max: 18,
  coaching_languages: [],
  training_days: [],
  student_range: "",
  student_range_label: "",
  links: { instagram: "https://instagram.com/kannurfa", youtube: null, facebook: null },
}

const about = (props: Partial<Parameters<typeof AboutSection>[0]> = {}) =>
  render(
    <AboutSection
      orgName="Kannur FA"
      description="We coach football in Kannur."
      website="https://kannurfa.in"
      level=""
      facts={FACTS}
      isMe={false}
      {...props}
    />
  )

/** The ResizeObserver callbacks, so a test can make the text "overflow". */
let measure: (() => void)[] = []
let overflowing = false

beforeEach(() => {
  measure = []
  overflowing = false
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
      }
      observe() {
        measure.push(this.callback)
      }
      disconnect() {}
      unobserve() {}
    }
  )
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => (overflowing ? 200 : 80))
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 80)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("AboutSection", () => {
  it("shows only the facts that are filled", () => {
    about()

    expect(screen.getByText("Founded")).toBeTruthy()
    expect(screen.getByText("2012")).toBeTruthy()
    expect(screen.getByText("6 – 18")).toBeTruthy()
    expect(screen.queryByText("Coaching in")).toBeNull()
    expect(screen.queryByText("Training days")).toBeNull()
    expect(screen.queryByText("Students")).toBeNull()
  })

  it("opens its links in a new tab with rel noopener, named with the org", () => {
    about()

    const website = screen.getByRole("link", { name: "Kannur FA's website" })
    const instagram = screen.getByRole("link", { name: "Kannur FA on Instagram" })
    for (const link of [website, instagram]) {
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toContain("noopener")
    }
    expect(screen.queryByRole("link", { name: /YouTube/ })).toBeNull()
  })

  it("offers Read more only when the text overflows its clamp", () => {
    about()
    act(() => measure.forEach((callback) => callback()))
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull()

    cleanup()
    overflowing = true
    about({ description: "A long story. ".repeat(40) })
    act(() => measure.forEach((callback) => callback()))

    const readMore = screen.getByRole("button", { name: "Read more" })
    expect(readMore.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(readMore)
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("draws nothing for a visitor when there is nothing to say, and the hint for the owner", () => {
    const empty = { description: "", website: "", facts: null }
    const { container } = about(empty)
    expect(container.innerHTML).toBe("")

    cleanup()
    about({ ...empty, isMe: true })
    expect(screen.getByRole("heading", { level: 2, name: "About" })).toBeTruthy()
    expect(screen.getByText(/Add a description/)).toBeTruthy()
  })

  it("leaves out the facts the desktop aside shows", () => {
    about({ omitFacts: ["founded", "ages", "students", "days"] })

    expect(screen.queryByText("Founded")).toBeNull()
    expect(screen.getByText("We coach football in Kannur.")).toBeTruthy()
  })
})
