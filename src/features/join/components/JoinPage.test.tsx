// @vitest-environment jsdom

/**
 * /join — the three states, and the rules that make them one page.
 *
 * These are interaction tests, because every claim this page makes is about an
 * interaction: intro → form → success without a navigation, two required
 * fields out of nine, a form that survives a failed submit. None of that is
 * visible in a render snapshot.
 *
 * What is pinned here:
 *   1. The states swap in place — no router, no route change, one mount.
 *   2. The progress bar paints EMPTY while the count is loading, and no
 *      spinner is inserted to do it. That is the anti-layout-shift rule, and
 *      it is the kind of thing that regresses the moment somebody "improves"
 *      the loading state.
 *   3. Name and phone are the only fields that can block a submit, and the
 *      body that comes out carries only what was actually filled in — the
 *      seven blanks are ABSENT, not "".
 *   4. `already_registered` is a success screen, not an error.
 *   5. A failed submit leaves every typed value exactly where it was.
 *
 * The API module is mocked; `JoinApiError` is kept real because the error
 * handling branches on `instanceof`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import JoinPage from "./JoinPage"
import { JoinApiError, fetchWaitlistStats, joinWaitlist } from "../services/join.api"
import type { SignupResult } from "../types"

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
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

vi.mock("../services/join.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/join.api")>()
  return {
    ...actual,
    fetchWaitlistStats: vi.fn(),
    joinWaitlist: vi.fn(),
  }
})

const mockStats = vi.mocked(fetchWaitlistStats)
const mockJoin = vi.mocked(joinWaitlist)

const RESULT: SignupResult = {
  signup_number: 47,
  ref_code: "GZ0047",
  name: "Arjun Menon",
  district: "kozhikode",
  already_registered: false,
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <JoinPage />
    </QueryClientProvider>,
  )
}

/** Walk to state 2 and fill only the two fields that are actually required. */
function fillRequired(name = "Arjun Menon", phone = "9847012345") {
  fireEvent.click(screen.getByRole("button", { name: /register as a player/i }))
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/whatsapp number/i), {
    target: { value: phone },
  })
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^register$/i }))

beforeEach(() => {
  vi.clearAllMocks()
  mockStats.mockResolvedValue({ count: 412, goal: 1000 })
  mockJoin.mockResolvedValue(RESULT)
})

afterEach(cleanup)

describe("the counter", () => {
  it("paints an empty bar while loading, with no spinner", async () => {
    // A promise that never settles — the loading state, held open.
    mockStats.mockReturnValue(new Promise(() => {}))

    const { container } = renderPage()

    // Plain DOM assertions — jest-dom is not set up in this project, so the
    // `toHaveAttribute` matchers are not available here.
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-busy")).toBe("true")
    // Unknown, not zero: nothing may claim the count is 0 before it is known.
    expect(bar.hasAttribute("aria-valuenow")).toBe(false)

    const fill = bar.firstElementChild as HTMLElement
    expect(fill.style.width).toBe("0%")

    // Whatever a spinner would be, it is not in here.
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(screen.queryByText(/loading/i)).toBeNull()
  })

  it("fills once the count lands", async () => {
    renderPage()

    await waitFor(() => {
      expect(
        screen.getByRole("progressbar").getAttribute("aria-valuenow"),
      ).toBe("412")
    })

    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement
    // 412/1000. Compared as a number — the exact string is float noise.
    expect(parseFloat(fill.style.width)).toBeCloseTo(41.2, 5)
  })
})

describe("the three states", () => {
  it("goes intro → form → success in place", async () => {
    renderPage()

    // 1 — intro
    expect(screen.getByRole("progressbar")).toBeTruthy()
    expect(screen.queryByLabelText(/full name/i)).toBeNull()

    // 2 — form
    fireEvent.click(screen.getByRole("button", { name: /register as a player/i }))
    expect(screen.getByLabelText(/full name/i)).toBeTruthy()
    expect(screen.queryByRole("progressbar")).toBeNull()

    // 3 — success
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Arjun Menon" },
    })
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), {
      target: { value: "9847012345" },
    })
    submit()

    await waitFor(() => {
      expect(screen.getByText(/you're in, arjun/i)).toBeTruthy()
    })
    expect(screen.getByText(/founding player #47/i)).toBeTruthy()
    expect(screen.getByText(/kozhikode/i)).toBeTruthy()
  })

  it("offers the story card as a real download, not a navigation", async () => {
    const { container } = renderPage()
    fillRequired()
    submit()

    await waitFor(() => {
      expect(screen.getByText(/you're in, arjun/i)).toBeTruthy()
    })

    // A plain <a download>, because next/link would intercept the click and
    // client-navigate instead of saving the file.
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/card/join/GZ0047"]',
    )!
    expect(link).toBeTruthy()
    expect(link.getAttribute("download")).toBe(
      "goatza-founding-player-GZ0047.png",
    )
    // The TODO is gone: nothing on this screen is disabled any more.
    expect(container.querySelector("button[disabled]")).toBeNull()
  })

  it("renders the same screen with a different heading for a repeat phone", async () => {
    mockJoin.mockResolvedValue({ ...RESULT, already_registered: true })

    renderPage()
    fillRequired()
    submit()

    await waitFor(() => {
      expect(screen.getByText(/you're already in/i)).toBeTruthy()
    })
    // Same number, and nothing that reads as a failure.
    expect(screen.getByText(/founding player #47/i)).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("what blocks a submit", () => {
  it("sends name + phone alone, with every blank field absent from the body", async () => {
    renderPage()
    fillRequired()
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))

    expect(mockJoin.mock.calls[0][0]).toEqual({
      name: "Arjun Menon",
      phone: "+919847012345",
    })
  })

  it("blocks on a missing name and a short phone, and never calls the API", async () => {
    renderPage()
    fillRequired("A", "12345")
    submit()

    await waitFor(() => {
      expect(screen.getByText(/please enter your full name/i)).toBeTruthy()
    })
    expect(screen.getByText(/enter a 10-digit number/i)).toBeTruthy()
    expect(mockJoin).not.toHaveBeenCalled()
  })

  it("accepts a pasted +91 number as the same ten digits", async () => {
    renderPage()
    fillRequired("Arjun Menon", "+91 98470-12345")
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))
    expect(mockJoin.mock.calls[0][0].phone).toBe("+919847012345")
  })

  it("lets the optional fields through once they are filled", async () => {
    renderPage()
    fillRequired()

    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: " arjun@example.com " },
    })
    fireEvent.change(screen.getByLabelText(/district/i), {
      target: { value: "kozhikode" },
    })
    fireEvent.change(screen.getByLabelText(/instagram/i), {
      target: { value: "@arjunplays" },
    })
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))

    expect(mockJoin.mock.calls[0][0]).toEqual({
      name: "Arjun Menon",
      phone: "+919847012345",
      email: "arjun@example.com",
      district: "kozhikode",
      instagram: "@arjunplays",
    })
  })
})

describe("the honeypot", () => {
  it("is in the DOM, out of reach, and rides along when something fills it", async () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole("button", { name: /register as a player/i }))

    const trap = container.querySelector<HTMLInputElement>("#website")!
    expect(trap).toBeTruthy()
    expect(trap.tabIndex).toBe(-1)
    expect(trap.getAttribute("autocomplete")).toBe("off")
    expect(trap.closest("[aria-hidden='true']")).toBeTruthy()
    // Never display:none — a bot that skips unrendered inputs is the bot this
    // is for.
    expect(trap.closest("div")!.className).not.toMatch(/hidden/i)

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Spam Bot" },
    })
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), {
      target: { value: "9000000001" },
    })
    fireEvent.change(trap, { target: { value: "http://spam.example" } })
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))
    // The client does not decide what a filled trap means — it forwards it and
    // lets the backend answer with the decoy.
    expect(mockJoin.mock.calls[0][0].website).toBe("http://spam.example")
  })
})

describe("failure", () => {
  it("keeps everything typed when the network drops", async () => {
    mockJoin.mockRejectedValue(new Error("network"))

    renderPage()
    fillRequired()
    fireEvent.change(screen.getByLabelText(/club or academy/i), {
      target: { value: "Kozhikode FC" },
    })
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalled())

    // Still on the form, still filled in, button usable again.
    await waitFor(() => {
      expect(
        (screen.getByLabelText(/full name/i) as HTMLInputElement).value,
      ).toBe("Arjun Menon")
    })
    expect(
      (screen.getByLabelText(/whatsapp number/i) as HTMLInputElement).value,
    ).toBe("9847012345")
    expect(
      (screen.getByLabelText(/club or academy/i) as HTMLInputElement).value,
    ).toBe("Kozhikode FC")
    expect(screen.queryByText(/you're in/i)).toBeNull()
  })

  it("puts a server field error on the field it belongs to", async () => {
    mockJoin.mockRejectedValue(
      new JoinApiError("Phone: Enter a valid phone number.", 400, {
        phone: "Enter a valid phone number.",
      }),
    )

    renderPage()
    fillRequired()
    submit()

    await waitFor(() => {
      expect(screen.getByText("Enter a valid phone number.")).toBeTruthy()
    })
    expect(
      (screen.getByLabelText(/full name/i) as HTMLInputElement).value,
    ).toBe("Arjun Menon")
  })
})
