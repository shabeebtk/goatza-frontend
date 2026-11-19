// @vitest-environment jsdom
/**
 * Facilities: the branch switch changes what is listed, the last thumb counts
 * the rest ("+N photos"), a tap opens the lightbox at that photo, and a photo
 * that fails is a quiet tile.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ShowcaseFacility } from "../../types"
import FacilitiesSection from "./FacilitiesSection"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
// The branch switch as plain buttons: what is chosen is what matters here.
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    options,
    value,
    onChange,
    "aria-label": label,
  }: {
    options: { value: string; label: string }[]
    value: string
    onChange: (value: string) => void
    "aria-label"?: string
  }) => (
    <div role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock("@/shared/components/ImageLightbox/MediaLightbox", () => ({
  default: ({ startIndex, media }: { startIndex: number; media: unknown[] }) => (
    <div data-testid="lightbox" data-start={startIndex} data-count={media.length} />
  ),
}))

const photos = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `ph-${index}`, url: `https://media.goatza.com/f/${index}.webp` }))

const TURF: ShowcaseFacility = {
  location: { id: "loc-1", name: "Thana Turf", city: "Kannur" },
  items: [{ key: "floodlights", label: "Floodlights", group: "playing_area" }],
  custom_items: ["Physio room"],
  photos: photos(6),
}

const GROUND: ShowcaseFacility = {
  location: { id: "loc-2", name: "Main Ground", city: "Kannur" },
  items: [{ key: "changing_rooms", label: "Changing rooms", group: "comfort" }],
  custom_items: [],
  photos: [],
}

afterEach(cleanup)

describe("FacilitiesSection", () => {
  it("switches branch, and the list follows", () => {
    render(<FacilitiesSection facilities={[TURF, GROUND]} />)

    expect(screen.getByText("Floodlights")).toBeTruthy()
    expect(screen.getByText("Physio room")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Main Ground, Kannur" }))

    expect(screen.getByText("Changing rooms")).toBeTruthy()
    expect(screen.queryByText("Floodlights")).toBeNull()
    expect(screen.queryAllByRole("img")).toHaveLength(0)
  })

  it("shows no branch switch with one branch", () => {
    render(<FacilitiesSection facilities={[TURF]} />)
    expect(screen.queryByRole("group", { name: "Branch" })).toBeNull()
  })

  it("counts the photos past the last thumb", () => {
    render(<FacilitiesSection facilities={[TURF]} />)

    // One large and three thumbs of six: two more.
    expect(screen.getByText("+2 photos")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Facilities at Thana Turf, photo 4, and 2 more" })).toBeTruthy()
  })

  it("opens the lightbox at the photo tapped", () => {
    render(<FacilitiesSection facilities={[TURF]} />)

    fireEvent.click(screen.getByRole("img", { name: "Facilities at Thana Turf, photo 3" }).closest("button")!)

    const lightbox = screen.getByTestId("lightbox")
    expect(lightbox.getAttribute("data-start")).toBe("2")
    expect(lightbox.getAttribute("data-count")).toBe("6")
  })

  it("loads photos lazily at an explicit size, and turns a failed one into a quiet tile", () => {
    render(<FacilitiesSection facilities={[TURF]} />)

    const main = screen.getByRole("img", { name: "Facilities at Thana Turf, photo 1" }) as HTMLImageElement
    expect(main.getAttribute("loading")).toBe("lazy")
    expect(main.getAttribute("decoding")).toBe("async")
    expect(main.getAttribute("width")).toBe("1280")
    expect(main.getAttribute("height")).toBe("720")

    fireEvent.error(main)

    const tile = screen.getByRole("img", { name: "Facilities at Thana Turf, photo 1" })
    expect(tile.tagName).toBe("SPAN")
  })

  it("draws nothing when no branch has anything", () => {
    const { container } = render(
      <FacilitiesSection facilities={[{ ...GROUND, items: [], custom_items: [], photos: [] }]} />
    )
    expect(container.innerHTML).toBe("")
  })
})
