// @vitest-environment jsdom

/**
 * Signup consent — the checkbox, and what it does to the request.
 *
 * Every claim here is about an interaction, which is why these are interaction
 * tests rather than a snapshot: consent is a thing a person DOES, and the
 * whole point of the feature is that nothing has happened until they do it.
 *
 * What is pinned:
 *   1. The box starts unticked. On every mount, with no way to seed it.
 *   2. Submit is disabled until it is ticked — and enabled the moment it is.
 *   3. A valid form still sends `accepted_terms: true`, explicitly. The flag
 *      is what the server files the agreement on; a form that silently omitted
 *      it would be rejected, and a form that hardcoded it without the tick
 *      would be filing an agreement nobody made.
 *   4. Switching to sign-in and back CLEARS the tick. Consent does not survive
 *      a trip through another form.
 *   5. The links point at /terms and /privacy and open in a new tab, so
 *      reading them never costs the half-filled form.
 *
 * The api module is mocked at the boundary; the react-hook-form + zod wiring
 * that actually enforces the rule is real, because that wiring IS the subject.
 *
 * Plain DOM assertions throughout — jest-dom is not set up in this project
 * (see the same note in features/join/components/JoinPage.test.tsx).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthCard from "./AuthCard"
import { signupApi } from "../../services/auth.api"

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const push = vi.fn()
const replace = vi.fn()

// ONE instance, not a fresh one per call. AuthCard has an effect keyed on the
// searchParams object that re-applies ?mode=; handing back a new object every
// render makes that effect fire forever and snaps the form back to signup,
// which looks exactly like the tab switch being broken.
const SEARCH_PARAMS = new URLSearchParams("mode=signup")

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => SEARCH_PARAMS,
  usePathname: () => "/auth",
}))

vi.mock("../../services/auth.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/auth.api")>()
  return {
    ...actual,
    signupApi: vi.fn(),
    loginApi: vi.fn(),
    verifyOtpApi: vi.fn(),
    getGoogleLoginUrl: vi.fn(),
  }
})

const mockSignup = vi.mocked(signupApi)

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AuthCard />
    </QueryClientProvider>,
  )
}

const consentBox = () =>
  screen.getByRole("checkbox", { name: /i agree to the/i }) as HTMLInputElement

const submitButton = () =>
  screen.getByRole("button", {
    name: /create free account/i,
  }) as HTMLButtonElement

function fillValidSignup() {
  fireEvent.change(screen.getByPlaceholderText("Rahul"), {
    target: { value: "Rahul" },
  })
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "rahul@example.com" },
  })
  fireEvent.change(screen.getByPlaceholderText("Create a strong password"), {
    target: { value: "password!123" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSignup.mockResolvedValue({ email: "rahul@example.com", verification_required: true })
})

afterEach(cleanup)

describe("signup consent checkbox", () => {
  it("starts unticked", () => {
    renderCard()

    expect(consentBox().checked).toBe(false)
  })

  it("keeps submit disabled until it is ticked", () => {
    renderCard()

    expect(submitButton().disabled).toBe(true)

    fireEvent.click(consentBox())

    expect(submitButton().disabled).toBe(false)
  })

  it("disables submit again if it is unticked", () => {
    renderCard()

    fireEvent.click(consentBox())
    fireEvent.click(consentBox())

    expect(consentBox().checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
  })

  it("does not submit while unticked, even with every other field valid", async () => {
    renderCard()
    fillValidSignup()

    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(mockSignup).not.toHaveBeenCalled()
    })
  })

  it("sends accepted_terms: true once ticked", async () => {
    renderCard()
    fillValidSignup()
    fireEvent.click(consentBox())

    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledTimes(1)
    })

    expect(mockSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "rahul@example.com",
        accepted_terms: true,
      }),
    )
  })

  it("clears the tick when the form is switched away and back", async () => {
    renderCard()

    fireEvent.click(consentBox())
    expect(consentBox().checked).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))
    fireEvent.click(await screen.findByRole("button", { name: /sign up free/i }))

    // A consent that survives a detour is a consent nobody gave on this form.
    expect(consentBox().checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
  })
})

describe("consent links", () => {
  it("points at the live legal routes", () => {
    renderCard()

    expect(
      screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href"),
    ).toBe("/terms")
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
    ).toBe("/privacy")
  })

  it("opens them in a new tab so a half-filled form survives", () => {
    renderCard()

    for (const name of ["Terms of Service", "Privacy Policy"]) {
      const link = screen.getByRole("link", { name })
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toContain("noopener")
    }
  })

  it("does not tell the user that continuing implies agreement", () => {
    renderCard()

    // The wording rule: agreement is the tick, not the act of continuing.
    expect(document.body.textContent).not.toMatch(/by continuing/i)
  })
})
