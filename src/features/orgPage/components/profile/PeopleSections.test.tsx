// @vitest-environment jsdom
/**
 * Coaches and Players we developed: a name links only when the person has a
 * profile, a missing or broken photo is initials, "Now at" wins over the club's
 * highlight, and Players shows three before "See all".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { coach, player } from "../../__fixtures__/pageShowcase"
import CoachesSection from "./CoachesSection"
import PlayersSection from "./PlayersSection"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@/shared/services/navigation.service", () => ({
  useNavigation: () => ({ toProfile: (username: string) => `/profile/${username}` }),
}))

afterEach(cleanup)

describe("CoachesSection", () => {
  it("links a coach on Goatza and leaves one who isn't as a name", () => {
    render(
      <CoachesSection
        coaches={[coach(), coach({ id: "coach-2", name: "Ravi Kumar", username: null, licence: "", years_coaching: 1 })]}
      />
    )

    expect(screen.getByRole("link", { name: "Meera Nair" }).getAttribute("href")).toBe("/profile/meeranair")
    expect(screen.queryByRole("link", { name: "Ravi Kumar" })).toBeNull()
    expect(screen.getByText("Ravi Kumar")).toBeTruthy()
    expect(screen.getByText("AFC C Licence · 12 yrs")).toBeTruthy()
    expect(screen.getByText("1 yr")).toBeTruthy()
  })

  it("shows initials with no photo, and when the photo fails", () => {
    render(<CoachesSection coaches={[coach({ photo: "https://media.goatza.com/c/1.webp" }), coach({ id: "c-2", name: "Ravi Kumar" })]} />)

    expect(screen.getByText("RK")).toBeTruthy()
    const photo = document.querySelector("img") as HTMLImageElement
    expect(photo.getAttribute("loading")).toBe("lazy")

    fireEvent.error(photo)

    expect(document.querySelector("img")).toBeNull()
    expect(screen.getByText("MN")).toBeTruthy()
  })

  it("draws nothing without coaches", () => {
    const { container } = render(<CoachesSection coaches={[]} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("PlayersSection", () => {
  const FIVE = ["Aditya Menon", "Bala Krishnan", "Chris Thomas", "Dev Anand", "Eby Joseph"].map((name, index) =>
    player({ username: `p${index}`, name })
  )

  it("says Now at over the club's highlight, and the highlight without it", () => {
    render(
      <PlayersSection
        orgType="academy"
        players={[
          player({ now_at: "Gokulam Kerala", highlight: "Captain in 2022" }),
          player({ username: "rahul", name: "Rahul Das", now_at: null, highlight: "Top scorer 2021" }),
        ]}
      />
    )

    expect(screen.getByText("Now at Gokulam Kerala")).toBeTruthy()
    expect(screen.queryByText("Captain in 2022")).toBeNull()
    expect(screen.getByText("Top scorer 2021")).toBeTruthy()
    expect(screen.getAllByText("Goalkeeper · here 2019 – 2023")).toHaveLength(2)
    expect(screen.getByText("Their time here is verified by the academy.")).toBeTruthy()
  })

  it("links a player with a username only", () => {
    render(<PlayersSection orgType="club" players={[player(), player({ username: "", name: "No Profile" })]} />)

    expect(screen.getByRole("link", { name: "Aditya Menon" }).getAttribute("href")).toBe("/profile/adityamenon")
    expect(screen.queryByRole("link", { name: "No Profile" })).toBeNull()
    expect(screen.getByText("NP")).toBeTruthy()
  })

  it("shows three, then See all N", () => {
    render(<PlayersSection orgType="academy" players={FIVE} />)

    expect(screen.queryByText("Dev Anand")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /See all 5 players/ }))
    expect(screen.getByText("Eby Joseph")).toBeTruthy()
  })
})
