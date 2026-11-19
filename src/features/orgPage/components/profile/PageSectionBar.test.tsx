// @vitest-environment jsdom
/**
 * The page's sticky section bar: hidden until the header's action row leaves
 * the screen, a chip scrolls to its section, the section in view gets
 * aria-current, and its observers are made once and let go on unmount.
 */

import { useRef } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SectionKey } from "../../types"
import PageSectionBar from "./PageSectionBar"

type Entry = Partial<IntersectionObserverEntry> & { target: Element }

class FakeObserver {
  static all: FakeObserver[] = []
  observed = new Set<Element>()
  disconnected = false
  constructor(
    public callback: (entries: Entry[]) => void,
    public options: IntersectionObserverInit = {}
  ) {
    FakeObserver.all.push(this)
  }
  observe(element: Element) {
    this.observed.add(element)
  }
  unobserve(element: Element) {
    this.observed.delete(element)
  }
  disconnect() {
    this.disconnected = true
    this.observed.clear()
  }
  takeRecords() {
    return []
  }
}

const headerObserver = () => FakeObserver.all.find((observer) => observer.options.rootMargin === "-56px 0px 0px 0px")!
const spyObserver = () => FakeObserver.all.find((observer) => String(observer.options.rootMargin).includes("-55%"))!

function Page({ sections }: { sections: SectionKey[] }) {
  const headerRef = useRef<HTMLDivElement | null>(null)
  return (
    <div>
      <div ref={headerRef} data-testid="header" />
      <PageSectionBar sections={sections} headerRef={headerRef} orgName="Kannur FA" logo="" />
      {sections.map((key) => (
        <section key={key} id={`page-${key}`} tabIndex={-1}>
          <h2>{key}</h2>
        </section>
      ))}
    </div>
  )
}

const SECTIONS: SectionKey[] = ["about", "programs", "coaches", "posts"]

const scrollHeaderAway = () =>
  act(() =>
    headerObserver().callback([
      {
        target: screen.getByTestId("header"),
        isIntersecting: false,
        boundingClientRect: { bottom: -20 } as DOMRectReadOnly,
        rootBounds: { top: 56 } as DOMRectReadOnly,
      },
    ])
  )

const nav = () => screen.getByRole("navigation", { name: "Page sections", hidden: true })

beforeEach(() => {
  FakeObserver.all = []
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PageSectionBar", () => {
  it("stays hidden until the header has scrolled away", () => {
    render(<Page sections={SECTIONS} />)

    expect(nav().hasAttribute("data-page-sticky-header")).toBe(false)

    scrollHeaderAway()

    expect(nav().getAttribute("data-page-sticky-header")).toBe("tall")
  })

  it("draws a chip per section, labelled, and nothing under three sections", () => {
    render(<Page sections={SECTIONS} />)
    expect(screen.getAllByRole("link", { hidden: true }).map((chip) => chip.textContent)).toEqual([
      "About",
      "Programs",
      "Coaches",
      "Posts",
    ])

    cleanup()
    render(<Page sections={["about", "posts"]} />)
    expect(screen.queryByRole("navigation", { name: "Page sections", hidden: true })).toBeNull()
  })

  it("scrolls to a section on a tap and marks its chip current", () => {
    render(<Page sections={SECTIONS} />)
    scrollHeaderAway()

    const chip = screen.getByRole("link", { name: "Coaches" })
    fireEvent.click(chip)

    const target = document.getElementById("page-coaches")!
    expect(target.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }))
    expect(chip.getAttribute("aria-current")).toBe("true")
    expect(screen.getByRole("link", { name: "About" }).hasAttribute("aria-current")).toBe(false)
    expect(document.activeElement).toBe(target)
  })

  it("follows the section in view", () => {
    render(<Page sections={SECTIONS} />)
    scrollHeaderAway()

    act(() =>
      spyObserver().callback([
        { target: document.getElementById("page-about")!, isIntersecting: false },
        { target: document.getElementById("page-programs")!, isIntersecting: true },
      ])
    )

    expect(screen.getByRole("link", { name: "Programs" }).getAttribute("aria-current")).toBe("true")
  })

  it("makes its observers once, watches sections as they arrive, and lets go on unmount", () => {
    const { rerender, unmount } = render(<Page sections={SECTIONS} />)
    const spy = spyObserver()
    expect(FakeObserver.all).toHaveLength(2)
    expect(spy.observed.size).toBe(4)

    rerender(<Page sections={[...SECTIONS.slice(0, 3), "trials", "posts"]} />)

    expect(FakeObserver.all).toHaveLength(2)
    expect(spy.observed.has(document.getElementById("page-trials")!)).toBe(true)

    unmount()
    expect(FakeObserver.all.every((observer) => observer.disconnected)).toBe(true)
  })
})
