// @vitest-environment jsdom

/**
 * The shared skeletons and their one prop.
 *
 * What is pinned is the contract the three callers rely on: the band only
 * exists when asked for, and with or without it the same silhouette is drawn.
 * PublicShell asks for the band because it replaces the whole chrome; the
 * route's loading.tsx and UserProfile must not, because a real nav is already
 * above them and a second band under it would be a visible extra bar.
 */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import ProfileSkeleton, { CVSkeleton } from "./ProfileSkeleton"
import styles from "./ProfileSkeleton.module.css"

afterEach(cleanup)

const count = (root: HTMLElement, className: string) =>
  root.getElementsByClassName(className).length

describe("ProfileSkeleton", () => {
  it("draws the nav band and takes the shell role only with withNavBand", () => {
    const { container } = render(<ProfileSkeleton withNavBand />)

    expect(count(container, styles.navBand)).toBe(1)
    expect(count(container, styles.shell)).toBe(1)
  })

  it("draws no band by default, for callers inside a real shell", () => {
    const { container } = render(<ProfileSkeleton />)

    expect(count(container, styles.navBand)).toBe(0)
    expect(count(container, styles.shell)).toBe(0)
  })

  it("draws the same profile silhouette either way", () => {
    const withBand = render(<ProfileSkeleton withNavBand />).container
    const without = render(<ProfileSkeleton />).container

    for (const part of [styles.page, styles.card, styles.cover, styles.avatar]) {
      expect(count(withBand, part)).toBe(1)
      expect(count(without, part)).toBe(1)
    }
  })

  it("is decoration, hidden from assistive tech", () => {
    const { container } = render(<ProfileSkeleton />)

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("CVSkeleton", () => {
  it("honours withNavBand the same way", () => {
    const withBand = render(<CVSkeleton withNavBand />).container
    const without = render(<CVSkeleton />).container

    expect(count(withBand, styles.navBand)).toBe(1)
    expect(count(without, styles.navBand)).toBe(0)
  })

  it("has no cover — the sheet starts with the photo beside the name", () => {
    const { container } = render(<CVSkeleton />)

    expect(count(container, styles.cover)).toBe(0)
    expect(count(container, styles.sheet)).toBe(1)
    expect(count(container, styles.cvPhoto)).toBe(1)
  })
})
