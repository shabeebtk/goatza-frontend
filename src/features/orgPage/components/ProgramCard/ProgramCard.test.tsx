// @vitest-environment jsdom
/** The program card the club's list, the editor's preview and the public page all draw. */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ProgramCard, { type ProgramCardData } from "./ProgramCard"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))

const program = (overrides: Partial<ProgramCardData> = {}): ProgramCardData => ({
  name: "U12 Football Foundation",
  age_min: 8,
  age_max: 12,
  level: "beginner",
  level_label: "Beginner",
  days: ["tue", "thu", "sat"],
  start_time: "16:30",
  end_time: "18:00",
  location: { name: "Main Ground", city: "Thrissur" },
  fee: { mode: "amount", amount: 1500, per: "month" },
  free_trial: false,
  spots: "open",
  ...overrides,
})

afterEach(cleanup)

describe("ProgramCard", () => {
  it("reads the program as a visitor would", () => {
    render(<ProgramCard program={program()} />)

    expect(screen.getByRole("heading", { name: "U12 Football Foundation" })).toBeTruthy()
    expect(screen.getByText("Ages 8 – 12 · Beginner")).toBeTruthy()
    expect(screen.getByText("Tue · Thu · Sat · 4:30 – 6:00 PM")).toBeTruthy()
    expect(screen.getByText("Main Ground, Thrissur")).toBeTruthy()
    expect(screen.getByText("₹1,500 / month")).toBeTruthy()
  })

  it("shows no badge while spots are open and there is no free trial", () => {
    render(<ProgramCard program={program()} />)

    expect(screen.queryByText("Free trial")).toBeNull()
    expect(screen.queryByText("Few spots left")).toBeNull()
    expect(screen.queryByText("Full")).toBeNull()
  })

  it("badges a free trial, few spots and a full program", () => {
    const { rerender } = render(<ProgramCard program={program({ free_trial: true, spots: "few" })} />)
    expect(screen.getByText("Free trial")).toBeTruthy()
    expect(screen.getByText("Few spots left")).toBeTruthy()

    rerender(<ProgramCard program={program({ spots: "full" })} />)
    expect(screen.getByText("Full")).toBeTruthy()
    expect(screen.queryByText("Few spots left")).toBeNull()
  })

  it("says Contact for fees, and leaves out a branch it doesn't have", () => {
    render(<ProgramCard program={program({ fee: { mode: "contact", amount: null, per: null }, location: null })} />)

    expect(screen.getByText("Contact for fees")).toBeTruthy()
    expect(screen.queryByText(/Main Ground/)).toBeNull()
  })

  it("carries the club's actions when it is given them", () => {
    render(<ProgramCard program={program()} actions={<button>Edit</button>} />)
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy()
  })
})
