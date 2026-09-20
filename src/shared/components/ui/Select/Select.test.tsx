// @vitest-environment jsdom

/**
 * Select — the custom listbox that replaced every native select element.
 *
 * What is pinned here is what the native element used to do for free and now
 * has to be written down: a placeholder when nothing is chosen, a list that
 * opens, a value that comes back as a plain string, arrow-and-Enter, Esc, a
 * disabled field that stays shut, and a disabled option that refuses to be
 * picked. Those are the regressions that would ship silently — the field
 * still renders, it just stops being a field.
 *
 * Plain DOM assertions — jest-dom is not set up in this project, so the
 * `toHaveAttribute` / `toHaveTextContent` matchers are not available here.
 *
 * jsdom applies no media queries, so `matchMedia` reports false and these all
 * exercise the DESKTOP dropdown. The bottom sheet is the same list in a
 * different box; what is different about it (the scroll lock, the back
 * gesture) belongs to hooks that have their own tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import Select, { type SelectOption } from "./Select"

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

// useBackToClose reaches for the app router; it is disabled on desktop but
// the hook still runs.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const POSITIONS: SelectOption[] = [
  { value: "gk", label: "Goalkeeper" },
  { value: "cb", label: "Centre Back" },
  { value: "cm", label: "Centre Midfield" },
  { value: "st", label: "Striker" },
]

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  // jsdom has no layout and no scrollIntoView; the component calls it on every
  // active-row change.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

/** The trigger, which is the only thing on screen while the panel is shut. */
const trigger = () => screen.getByRole("combobox")

function renderSelect(props: Partial<React.ComponentProps<typeof Select>> = {}) {
  const onChange = vi.fn()
  render(
    <Select
      label="Position"
      placeholder="Select your position"
      options={POSITIONS}
      value=""
      onChange={onChange}
      {...props}
    />
  )
  return { onChange }
}

describe("Select", () => {
  it("shows the placeholder while nothing is chosen, and the label once it is", () => {
    const { unmount } = render(
      <Select label="Position" placeholder="Select your position" options={POSITIONS} value="" onChange={() => {}} />
    )
    expect(trigger().textContent).toContain("Select your position")
    unmount()

    render(
      <Select label="Position" placeholder="Select your position" options={POSITIONS} value="cm" onChange={() => {}} />
    )
    expect(trigger().textContent).toContain("Centre Midfield")
    expect(trigger().textContent).not.toContain("Select your position")
  })

  it("opens the list on click", () => {
    renderSelect()
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(trigger().getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger())

    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(screen.getAllByRole("option")).toHaveLength(POSITIONS.length)
    expect(screen.getByRole("option", { name: /Goalkeeper/ })).toBeTruthy()
  })

  it("hands back the plain value of the option clicked, and closes", () => {
    const { onChange } = renderSelect()
    fireEvent.click(trigger())

    fireEvent.click(screen.getByRole("option", { name: /Striker/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith("st")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("selects with the arrow keys and Enter", () => {
    const { onChange } = renderSelect({ searchable: false })

    // ArrowDown on a closed trigger opens it, on the first row.
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    expect(screen.getByRole("listbox")).toBeTruthy()

    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    fireEvent.keyDown(trigger(), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith("cb")
  })

  it("closes on Esc without choosing anything", () => {
    const { onChange } = renderSelect({ searchable: false })
    fireEvent.click(trigger())
    expect(screen.getByRole("listbox")).toBeTruthy()

    fireEvent.keyDown(trigger(), { key: "Escape" })

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("does not open while disabled", () => {
    renderSelect({ disabled: true })

    fireEvent.click(trigger())
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })

    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("filters on the search box, prefix matches first", () => {
    renderSelect({ searchable: true })
    fireEvent.click(trigger())

    fireEvent.change(screen.getByLabelText("Search Position"), { target: { value: "centre" } })

    const labels = screen.getAllByRole("option").map((option) => option.textContent)
    expect(labels).toEqual(["Centre Back", "Centre Midfield"])

    // "keeper" is inside Goalkeeper but does not start it — still a match.
    fireEvent.change(screen.getByLabelText("Search Position"), { target: { value: "keeper" } })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Goalkeeper"])
  })

  it("says so when the search matches nothing", () => {
    renderSelect({ searchable: true })
    fireEvent.click(trigger())

    fireEvent.change(screen.getByLabelText("Search Position"), { target: { value: "zzz" } })

    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByText(/No matches for/)).toBeTruthy()
  })

  it("refuses a disabled option, by click and by keyboard", () => {
    const options: SelectOption[] = [
      { value: "gk", label: "Goalkeeper" },
      { value: "cb", label: "Centre Back", disabled: true },
      { value: "st", label: "Striker" },
    ]
    const onChange = vi.fn()
    render(
      <Select label="Position" placeholder="Pick one" options={options} value="" onChange={onChange} searchable={false} />
    )

    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole("option", { name: /Centre Back/ }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("listbox")).toBeTruthy()

    // Arrowing down from Goalkeeper steps OVER Centre Back, not onto it.
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    fireEvent.keyDown(trigger(), { key: "Enter" })

    expect(onChange).toHaveBeenCalledWith("st")
  })
})
