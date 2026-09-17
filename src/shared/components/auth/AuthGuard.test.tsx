// @vitest-environment jsdom

/**
 * AuthGuard — where `?next=` is CAPTURED, and when it deliberately is not.
 *
 * The guard is the load-bearing producer of `next`: it is what fires on session
 * expiry, on a deep link opened while logged out, and on a cold load that
 * initAuth could not refresh. What is pinned:
 *
 *   1. An expired session is sent to /auth carrying the FULL location — path
 *      AND query string — so `/settings?tab=x` comes back as `/settings?tab=x`,
 *      not as the settings root.
 *   2. A deliberate logout is sent to a plain /auth. Capturing there would
 *      leave `/auth?next=/settings` behind for the next person who signs in on
 *      the device.
 *   3. A blocked path is a plain /auth too — the guard defers to
 *      `authUrlWithNext` rather than validating anything itself.
 *   4. While auth is still loading nothing happens, and an authenticated user
 *      just sees the page.
 *
 * The URL is set with `history.replaceState` so `window.location.search` is the
 * real thing — the guard reads it from window on purpose (see the comment in
 * the component), so a mocked `useSearchParams` would test the wrong thing.
 * The three gates are stubbed: each has its own tests and its own store.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthGuard from "./AuthGuard"
import { useAuthStore } from "@/store/auth.store"

const nav = vi.hoisted(() => ({
  pathname: "/settings",
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
}))

vi.mock("@/features/guardian/components/GuardianGate", () => ({
  default: () => null,
}))
vi.mock("@/features/onboarding/components/OnboardingGate", () => ({
  default: () => null,
}))
vi.mock("@/features/legal/components/LegalConsentGate", () => ({
  default: () => null,
}))

function setLocation(pathname: string, search = "") {
  nav.pathname = pathname
  window.history.replaceState({}, "", `${pathname}${search}`)
}

function nextParamOf(url: string): string | null {
  return new URL(url, "http://localhost").searchParams.get("next")
}

describe("AuthGuard", () => {
  beforeEach(() => {
    nav.push.mockReset()
    nav.replace.mockReset()
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      authExitReason: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("captures path AND query string when the session expired", () => {
    setLocation("/settings", "?tab=x")
    useAuthStore.setState({ authExitReason: "expired" })

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(nav.replace).toHaveBeenCalledTimes(1)
    const [url] = nav.replace.mock.calls[0] as [string]
    expect(url.startsWith("/auth?")).toBe(true)
    expect(nextParamOf(url)).toBe("/settings?tab=x")
    // The query string is encoded INTO the param, not appended beside it.
    expect(url).toBe("/auth?next=%2Fsettings%3Ftab%3Dx")
    expect(nav.push).not.toHaveBeenCalled()
    expect(screen.queryByText("protected")).toBeNull()
  })

  it("captures on a cold load with no exit reason at all", () => {
    // initAuth giving up (offline, 5xx) leaves the reason null — the person
    // still has somewhere they were going.
    setLocation("/messages", "")

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nextParamOf(nav.replace.mock.calls[0][0])).toBe("/messages")
  })

  it("sends a deliberate logout to a plain /auth with no next", () => {
    setLocation("/settings", "?tab=x")
    useAuthStore.setState({ authExitReason: "logout" })

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith("/auth")
  })

  it("sends a blocked path to a plain /auth with no next", () => {
    setLocation("/api/user/details", "")
    useAuthStore.setState({ authExitReason: "expired" })

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith("/auth")
  })

  it("does nothing while auth is still loading", () => {
    setLocation("/settings", "?tab=x")
    useAuthStore.setState({ isLoading: true })

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(nav.replace).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
    expect(screen.queryByText("protected")).toBeNull()
  })

  it("renders children and does not redirect when authenticated", () => {
    setLocation("/settings", "?tab=x")
    useAuthStore.setState({ isAuthenticated: true })

    render(
      <AuthGuard>
        <p>protected</p>
      </AuthGuard>
    )

    expect(screen.getByText("protected")).toBeTruthy()
    expect(nav.replace).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })
})
