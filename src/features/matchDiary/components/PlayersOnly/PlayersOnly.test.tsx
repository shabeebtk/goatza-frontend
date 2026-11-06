// @vitest-environment jsdom
/** The diary's route guard, for /matches and /settings/match-diary. */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import PlayersOnly from "./PlayersOnly"

const replace = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))

const as = (role: string | null, actorType = "user", isLoading = false) =>
  useAuthStore.setState({
    user: role ? ({ id: "u1", role } as never) : null,
    actorType,
    isLoading,
  } as never)

const renderGuard = () =>
  render(
    <PlayersOnly>
      <p>The diary</p>
    </PlayersOnly>
  )

beforeEach(() => {
  replace.mockClear()
})

afterEach(cleanup)

describe("PlayersOnly", () => {
  it("lets a player acting as themselves through", () => {
    as("player")

    renderGuard()

    expect(screen.getByText("The diary")).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it.each(["coach", "scout", "org_user"])("sends a %s to /home", (role) => {
    as(role)

    renderGuard()

    expect(screen.queryByText("The diary")).toBeNull()
    expect(replace).toHaveBeenCalledWith("/home")
  })

  it("sends a player acting as an organization to /home", () => {
    as("player", "organization")

    renderGuard()

    expect(screen.queryByText("The diary")).toBeNull()
    expect(replace).toHaveBeenCalledWith("/home")
  })

  it("waits while the session resolves, so a cold start does not bounce a player", () => {
    as(null, "user", true)

    renderGuard()

    expect(screen.queryByText("The diary")).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })
})
