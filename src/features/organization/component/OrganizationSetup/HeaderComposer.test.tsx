// @vitest-environment jsdom

/**
 * HeaderComposer with both photos set: Replace / Remove for the logo AND the
 * cover are all there and each does its own thing. (They once sat under the
 * banner, where a tap picked a new cover; jsdom has no layout, so this pins
 * the wiring and that the actions live outside the banner's button.)
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("../OrgPhotoCropSheet/OrgPhotoCropSheet", () => ({ default: () => null }))
vi.mock("@/shared/services/imageVariants", () => ({
  ensureDecodableImage: vi.fn(async (file: File) => file),
}))

import HeaderComposer, { type PickedPhoto } from "./HeaderComposer"

const photo = (name: string): PickedPhoto => ({
  blob: new Blob(["x"], { type: "image/jpeg" }),
  name,
  url: `blob:${name}`,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("HeaderComposer actions", () => {
  it("with a logo and a cover, all four buttons are there and do their own thing", () => {
    const onChange = vi.fn()
    // Which hidden file input a button opened.
    const opened: HTMLInputElement[] = []
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      opened.push(this)
    })

    render(
      <HeaderComposer
        logo={photo("logo.jpg")}
        cover={photo("cover.jpg")}
        onChange={onChange}
        typeIcon="mdi:soccer"
      />
    )

    const banner = screen.getByRole("button", { name: "Change cover photo" })
    const buttons = ["Replace logo", "Remove logo", "Replace cover", "Remove cover"].map(
      (name) => screen.getByRole("button", { name })
    )
    for (const button of buttons) {
      expect(banner.contains(button)).toBe(false)
      expect(button.hasAttribute("disabled")).toBe(false)
    }
    const [replaceLogo, removeLogo, replaceCover, removeCover] = buttons

    fireEvent.click(replaceLogo)
    expect(opened.at(-1)).toBe(screen.getByTestId("org-create-logo-input"))

    fireEvent.click(replaceCover)
    expect(opened.at(-1)).toBe(screen.getByTestId("org-create-cover-input"))

    fireEvent.click(removeLogo)
    expect(onChange).toHaveBeenLastCalledWith("logo", null)

    fireEvent.click(removeCover)
    expect(onChange).toHaveBeenLastCalledWith("cover", null)
  })

  it("points the photo buttons at the step's photo error when there is one", () => {
    render(
      <HeaderComposer
        logo={null}
        cover={null}
        onChange={vi.fn()}
        typeIcon="mdi:soccer"
        errorId="org-create-photos-error"
      />
    )

    for (const name of ["Add cover photo", "Add logo"]) {
      const describedBy = screen.getByRole("button", { name }).getAttribute("aria-describedby")
      expect(describedBy?.split(" ")).toEqual(["org-create-photos-hint", "org-create-photos-error"])
    }
  })
})
