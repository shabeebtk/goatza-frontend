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
 *      blanks are ABSENT, not "".
 *   4. `already_registered` is a success screen, not an error.
 *   5. A failed submit leaves every typed value exactly where it was.
 *   6. The founding promise is conditional: the perks disappear the moment the
 *      counter reaches the goal. This is the assertion that stops the page
 *      advertising something already gone.
 *   7. A picked city rides along as a NESTED `location` object, and an
 *      untouched picker sends no `location` key at all.
 *   8. Every share path degrades rather than failing: native share when the
 *      phone has it, clipboard when it will, `execCommand` when it will not,
 *      and the caption on screen when nothing worked. The last one is the
 *      assertion that matters — it is the branch a user only reaches when
 *      everything else has already gone wrong.
 *
 * The API module is mocked; `JoinApiError` is kept real because the error
 * handling branches on `instanceof`. Mapbox is mocked too — the city picker is
 * a network call behind a debounce, and this suite is about what the form does
 * with a selection, not about the geocoder.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { toast } from "sonner"

import JoinPage from "./JoinPage"
import { searchCities } from "@/shared/services/mapbox.service"
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

vi.mock("@/shared/services/mapbox.service", () => ({
  searchCities: vi.fn(),
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
const mockCities = vi.mocked(searchCities)

/** The display number — 11 real signups behind an offset of 36. */
const RESULT: SignupResult = {
  signup_number: 47,
  ref_code: "GZ0047",
  name: "Arjun Menon",
  city: "Kozhikode",
  is_founding: true,
  already_registered: false,
}

/** One Mapbox result, in the shape the service returns. */
const KOZHIKODE = {
  label: "Kozhikode, Kerala, India",
  name: "Kozhikode",
  state: "Kerala",
  country_code: "IN",
  latitude: 11.2588,
  longitude: 75.7804,
  external_id: "place.11223344",
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

/**
 * Type into the city search and take the first suggestion.
 *
 * Real timers, not fake ones: the picker debounces its search by 350ms and this
 * suite runs react-query alongside it, where swapping the clock out turns every
 * `waitFor` into a manual tick. `findByRole` already waits up to a second,
 * which is the same wait expressed as a condition instead of a duration.
 */
async function pickCity(query = "Kozhi") {
  fireEvent.change(screen.getByLabelText(/where do you play/i), {
    target: { value: query },
  })

  const option = await screen.findByRole("option", { name: /kozhikode/i })
  // The list selects on mousedown, not click — a click fires after blur, by
  // which point the dropdown has closed.
  fireEvent.mouseDown(option)
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^register$/i }))

beforeEach(() => {
  vi.clearAllMocks()
  mockStats.mockResolvedValue({ count: 412, goal: 1000 })
  mockJoin.mockResolvedValue(RESULT)
  mockCities.mockResolvedValue([KOZHIKODE])
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

describe("the intro", () => {
  it("sells the platform before it asks for anything", async () => {
    renderPage()

    expect(screen.getByText(/where the greatest get/i)).toBeTruthy()
    expect(screen.getByText(/what's coming/i)).toBeTruthy()

    for (const feature of [
      /your player profile/i,
      /get discovered/i,
      /real opportunities/i,
      /talk directly/i,
    ]) {
      expect(screen.getByText(feature)).toBeTruthy()
    }

    // Nothing on this page claims a state or a country any more.
    expect(screen.queryByText(/kerala/i)).toBeNull()
  })

  it("offers the founding perks while there are spots left", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/the first 1,000 players/i)).toBeTruthy()
    })
    expect(screen.getByText(/premium access, free, after launch/i)).toBeTruthy()
    expect(screen.getByText(/permanent founding player badge/i)).toBeTruthy()
  })

  it("drops every perk once the goal is reached", async () => {
    // The promise is spent. The list is still open; the offer is not.
    mockStats.mockResolvedValue({ count: 1000, goal: 1000 })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/join the waitlist/i)).toBeTruthy()
    })
    expect(screen.queryByText(/premium access/i)).toBeNull()
    expect(screen.queryByText(/founding player badge/i)).toBeNull()
    expect(screen.queryByText(/early access/i)).toBeNull()

    // Still a counter, still a way in.
    expect(screen.getByRole("progressbar")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /register as a player/i }),
    ).toBeTruthy()
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
    expect(screen.getByText(/#47 · Kozhikode/)).toBeTruthy()
    expect(screen.getByText(/founding player/i)).toBeTruthy()
  })

  it("shows no founding badge for a player past the cohort", async () => {
    mockJoin.mockResolvedValue({ ...RESULT, is_founding: false })

    renderPage()
    fillRequired()
    submit()

    await waitFor(() => {
      expect(screen.getByText(/you're in, arjun/i)).toBeTruthy()
    })
    // The number and the city still show; the title does not.
    expect(screen.getByText(/#47 · Kozhikode/)).toBeTruthy()
    expect(screen.queryByText(/founding player/i)).toBeNull()
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
    expect(screen.getByText(/#47 · Kozhikode/)).toBeTruthy()
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
    fireEvent.change(screen.getByLabelText(/instagram/i), {
      target: { value: "@arjunplays" },
    })
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))

    expect(mockJoin.mock.calls[0][0]).toEqual({
      name: "Arjun Menon",
      phone: "+919847012345",
      email: "arjun@example.com",
      instagram: "@arjunplays",
    })
  })
})

describe("the city", () => {
  it("sends the picked city as a nested location object", async () => {
    renderPage()
    fillRequired()
    await pickCity()
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))

    // The rename is the whole point: Mapbox's `label` is the backend's `name`,
    // and Mapbox's `name` is the backend's `city`.
    expect(mockJoin.mock.calls[0][0].location).toEqual({
      name: "Kozhikode, Kerala, India",
      city: "Kozhikode",
      state: "Kerala",
      country: "",
      country_code: "IN",
      latitude: 11.2588,
      longitude: 75.7804,
      external_id: "place.11223344",
    })
  })

  it("omits the key entirely when no city was picked — never null, never {}", async () => {
    renderPage()
    fillRequired()
    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))
    expect("location" in mockJoin.mock.calls[0][0]).toBe(false)
  })

  it("never blocks a submit when the geocoder is down", async () => {
    mockCities.mockRejectedValue(new Error("mapbox down"))

    renderPage()
    fillRequired()

    fireEvent.change(screen.getByLabelText(/where do you play/i), {
      target: { value: "Kozhi" },
    })
    await waitFor(() => expect(mockCities).toHaveBeenCalled())

    submit()

    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(1))
    expect("location" in mockJoin.mock.calls[0][0]).toBe(false)
  })
})

describe("sharing the card", () => {
  /** Walk to the success screen. Every test in here starts there. */
  async function reachSuccess(result: Partial<SignupResult> = {}) {
    mockJoin.mockResolvedValue({ ...RESULT, ...result })
    renderPage()
    fillRequired()
    submit()
    await waitFor(() => expect(screen.getByText(/you're in, arjun/i)).toBeTruthy())
  }

  const CAPTION =
    "I've joined Goatza as a founding player.\n" +
    "Where the greatest get discovered.\n" +
    "Launching 1 Jan 2027 — goatza.com"

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("always offers the card as a plain download link", async () => {
    const { container } = renderPage()
    mockJoin.mockResolvedValue(RESULT)
    fillRequired()
    submit()
    await waitFor(() => expect(screen.getByText(/you're in, arjun/i)).toBeTruthy())

    // A real <a download>, not a next/link — next/link would intercept the
    // click and client-navigate instead of saving the file. This one needs no
    // JavaScript at all, which is why it is the path that is always offered.
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/card/join/GZ0047"]',
    )!
    expect(link).toBeTruthy()
    expect(link.getAttribute("download")).toBe(
      "goatza-founding-player-GZ0047.png",
    )
    // Nothing on this screen is waiting on anything: no share is in flight, so
    // no button is disabled.
    expect(container.querySelector("button[disabled]")).toBeNull()
  })

  it("copies the caption and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    await reachSuccess()
    fireEvent.click(screen.getByRole("button", { name: /copy caption/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CAPTION))
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
    // Nothing failed, so nothing extra is shown.
    expect(screen.queryByLabelText(/share caption/i)).toBeNull()
  })

  it("drops the founding claim from the caption when it is not true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    await reachSuccess({ is_founding: false })
    fireEvent.click(screen.getByRole("button", { name: /copy caption/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const sent = writeText.mock.calls[0][0] as string
    expect(sent).toContain("I've joined the Goatza waitlist.")
    expect(sent).not.toContain("founding player")
  })

  it("falls back to execCommand when the clipboard API refuses", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    // Deprecated, and exactly why the fallback exists: this is what an older
    // mobile browser gives you instead of the clipboard API.
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    await reachSuccess()
    fireEvent.click(screen.getByRole("button", { name: /copy caption/i }))

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"))
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
    expect(screen.queryByLabelText(/share caption/i)).toBeNull()
  })

  it("shows the caption to select when nothing can copy it", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })

    document.execCommand = vi.fn().mockReturnValue(false)

    await reachSuccess()
    fireEvent.click(screen.getByRole("button", { name: /copy caption/i }))

    // The words themselves, in something a thumb can select. This is the
    // branch that must never be a button that silently does nothing.
    const block = (await screen.findByLabelText(
      /share caption/i,
    )) as HTMLTextAreaElement
    expect(block.value).toBe(CAPTION)
    expect(block.readOnly).toBe(true)
    expect(vi.mocked(toast.error)).toHaveBeenCalled()
  })

  it("shares the image and the caption in one action where the phone can", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal("navigator", { ...navigator, share, canShare })

    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => png,
    })
    vi.stubGlobal("fetch", fetchMock)

    await reachSuccess()

    // With native share available it leads, and the download drops to secondary.
    const shareButton = screen.getByRole("button", { name: /share my card/i })
    fireEvent.click(shareButton)

    await waitFor(() => expect(share).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledWith("/card/join/GZ0047")

    const payload = share.mock.calls[0][0] as { files: File[]; text: string }
    expect(payload.text).toBe(CAPTION)
    expect(payload.files).toHaveLength(1)
    expect(payload.files[0].name).toBe("goatza-founding-player-GZ0047.png")
    expect(payload.files[0].type).toBe("image/png")
  })

  it("says nothing when somebody opens the share sheet and closes it", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"))
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
      canShare: vi.fn().mockReturnValue(true),
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => new Blob([], { type: "image/png" }),
      }),
    )

    await reachSuccess()
    fireEvent.click(screen.getByRole("button", { name: /share my card/i }))

    await waitFor(() => expect(share).toHaveBeenCalled())
    // A cancellation is a decision, not a failure.
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    // And the button is still there, because nothing about it is broken.
    expect(screen.getByRole("button", { name: /share my card/i })).toBeTruthy()
  })

  it("retires the share button and points at the manual paths when it fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("no handler"))
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
      canShare: vi.fn().mockReturnValue(true),
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => new Blob([], { type: "image/png" }),
      }),
    )

    await reachSuccess()
    fireEvent.click(screen.getByRole("button", { name: /share my card/i }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /share my card/i })).toBeNull()
    })
    expect(vi.mocked(toast.error)).toHaveBeenCalled()
    // The two that still work are still there.
    expect(screen.getByRole("button", { name: /copy caption/i })).toBeTruthy()
    expect(screen.getByText(/download my story card/i)).toBeTruthy()
  })

  it("keeps the Instagram link and the three steps", async () => {
    await reachSuccess()

    expect(screen.getByText(/now send your videos/i)).toBeTruthy()
    expect(screen.getByText(/dm 2–3 clips and your name/i)).toBeTruthy()
    expect(screen.getByText(/best clips get featured/i)).toBeTruthy()
    expect(screen.getByText(/follow @goatza\.sports/i)).toBeTruthy()
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
