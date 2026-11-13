// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { careerEntrySchema, type CareerEntry, type CareerSquad } from "../../types"
import CareerEntryCard from "./CareerEntryCard"
import styles from "./CareerEntryCard.module.css"

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))

const ORG = {
  id: "org-1",
  name: "Dream FC",
  username: "dreamfc",
  type: "club",
  logo: "",
  headline: "",
  is_verified: false,
}

const SQUAD: CareerSquad = {
  id: "sq-1",
  name: "U17 Boys",
  jersey_number: 9,
  is_captain: false,
  position_name: "Centre-back",
}

const entry = (overrides: Partial<CareerEntry> = {}): CareerEntry => ({
  id: "e1",
  organization: ORG,
  organization_name: "Dream FC",
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer", icon_url: "" },
  title: "Defender",
  entry_type: "club_team",
  squad_level: "youth",
  age_group: "U17",
  positions: [],
  start_date: "2025-06-01",
  end_date: null,
  is_current: true,
  description: "",
  verification_status: "verified",
  verified_at: "2025-07-01T10:00:00Z",
  source: "squad",
  created_at: "2025-06-01T10:00:00Z",
  updated_at: "2025-07-01T10:00:00Z",
  squad: SQUAD,
  ...overrides,
})

const renderCard = (value: CareerEntry) =>
  render(<CareerEntryCard entry={value} isOwn={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

afterEach(cleanup)

describe("CareerEntryCard · the squad behind the stint", () => {
  it("shows the shirt number and the squad name in one pill, linking to the squad's page", () => {
    const { container } = renderCard(entry())

    const pill = container.querySelector(`.${styles.squadPill}`) as HTMLElement
    expect(pill.tagName).toBe("A")
    expect(pill.getAttribute("href")).toBe("/organization/profile/dreamfc/squads/sq-1")
    expect(pill.querySelector(`.${styles.squadNumber}`)?.textContent).toBe("#9")
    expect(pill.querySelector(`.${styles.squadName}`)?.textContent).toBe("U17 Boys")
  })

  it("shows just the name when the player has no number", () => {
    const { container } = renderCard(entry({ squad: { ...SQUAD, jersey_number: null } }))

    const pill = container.querySelector(`.${styles.squadPill}`) as HTMLElement
    expect(pill.textContent).toBe("U17 Boys")
    expect(pill.querySelector(`.${styles.squadNumber}`)).toBeNull()
  })

  it("puts the position beside the pill, in the muted style", () => {
    const { container } = renderCard(entry())

    const position = container.querySelector(`.${styles.squadPosition}`)
    expect(position?.textContent).toBe("Centre-back")
  })

  it("leaves the position out when the club gave none", () => {
    const { container } = renderCard(entry({ squad: { ...SQUAD, position_name: "" } }))

    expect(container.querySelector(`.${styles.squadPosition}`)).toBeNull()
  })

  it("adds a Captain badge only for the captain", () => {
    renderCard(entry())
    expect(screen.queryByText("Captain")).toBeNull()
    cleanup()

    renderCard(entry({ squad: { ...SQUAD, is_captain: true } }))
    expect(screen.getByText("Captain")).toBeTruthy()
  })

  it("is plain text when the club is not a linked page with a handle", () => {
    const { container } = renderCard(entry({ organization: null }))

    const pill = container.querySelector(`.${styles.squadPill}`) as HTMLElement
    expect(pill.tagName).toBe("SPAN")
    expect(container.querySelector('a[href*="/squads/"]')).toBeNull()
    cleanup()

    const noHandle = renderCard(entry({ organization: { ...ORG, username: "" } }))
    expect(noHandle.container.querySelector(`.${styles.squadPill}`)?.tagName).toBe("SPAN")
  })

  it("draws no squad line when the entry has no squad", () => {
    const withNull = renderCard(entry({ squad: null }))
    expect(withNull.container.querySelector(`.${styles.squadLine}`)).toBeNull()
    cleanup()

    const { squad: _omit, ...older } = entry()
    void _omit
    const absent = renderCard(older as CareerEntry)
    expect(absent.container.querySelector(`.${styles.squadLine}`)).toBeNull()
  })

  it("keeps the existing verified line", () => {
    renderCard(entry())
    expect(screen.getByText(/Verified by Dream FC/)).toBeTruthy()
  })
})

describe("careerEntrySchema · squad", () => {
  const payload = () => {
    const { squad: _omit, ...rest } = entry()
    void _omit
    return rest
  }

  it("accepts an older payload with no squad key at all", () => {
    const parsed = careerEntrySchema.parse(payload())
    expect(parsed.squad).toBeUndefined()
  })

  it("accepts squad: null", () => {
    expect(careerEntrySchema.parse({ ...payload(), squad: null }).squad).toBeNull()
  })

  it("accepts a squad object, number and all", () => {
    expect(careerEntrySchema.parse({ ...payload(), squad: SQUAD }).squad).toEqual(SQUAD)
    expect(
      careerEntrySchema.parse({ ...payload(), squad: { ...SQUAD, jersey_number: null } }).squad
        ?.jersey_number
    ).toBeNull()
  })

  it("accepts the squad source the server now sends", () => {
    expect(careerEntrySchema.parse({ ...payload(), source: "squad" }).source).toBe("squad")
  })
})
