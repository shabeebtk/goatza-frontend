// @vitest-environment jsdom

/**
 * The re-consent modal — the one dialog in the app that must not close.
 *
 * The tests that matter here are the negative ones. A dismissable version of
 * this modal does not look broken: it looks fine, and the user simply lands
 * back in an app where every write fails with no explanation. So Escape and
 * the backdrop are pinned as NON-actions, and "Log out" is pinned as present,
 * because a blocking modal whose only button is "I agree" is a trap rather
 * than a choice.
 *
 * Plain DOM assertions — jest-dom is not set up in this project (same note as
 * features/join/components/JoinPage.test.tsx).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LegalConsentModal from "./LegalConsentModal"
import { acceptLegalApi } from "../../services/legal.api"
import { useLegalConsentStore } from "../../store/legalConsent.store"
import { getUserApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

vi.mock("../../services/legal.api", () => ({
  acceptLegalApi: vi.fn(),
  getLegalVersionsApi: vi.fn(),
}))

vi.mock("@/features/auth/services/auth.api", () => ({
  getUserApi: vi.fn(),
  logoutApi: vi.fn(),
}))

const mockAccept = vi.mocked(acceptLegalApi)
const mockGetUser = vi.mocked(getUserApi)

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LegalConsentModal />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useLegalConsentStore.setState({
    pendingDocuments: ["terms", "privacy"],
    open: true,
  })
  mockAccept.mockResolvedValue({ accepted: ["terms", "privacy"], pending: [] })
  mockGetUser.mockResolvedValue({ id: "u1", username: "player" })
})

afterEach(() => {
  cleanup()
  useLegalConsentStore.setState({ pendingDocuments: [], open: false })
})

describe("it cannot be dismissed", () => {
  it("stays up when Escape is pressed", () => {
    renderModal()

    fireEvent.keyDown(window, { key: "Escape" })

    expect(useLegalConsentStore.getState().open).toBe(true)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("stays up when the backdrop is clicked", () => {
    const { container } = renderModal()

    // The backdrop IS the dialog element here; clicking it must do nothing.
    fireEvent.click(container.firstElementChild as HTMLElement)

    expect(useLegalConsentStore.getState().open).toBe(true)
  })

  it("has no close button at all", () => {
    renderModal()

    expect(screen.queryByRole("button", { name: /close|dismiss|not now|later/i }))
      .toBeNull()
  })
})

describe("the two ways forward", () => {
  it("offers a way out that is not agreeing", () => {
    renderModal()

    // A modal that blocks the app with only one button is a trap.
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy()
  })

  it("posts the pending documents on agree and closes", async () => {
    renderModal()

    fireEvent.click(screen.getByRole("button", { name: /i agree/i }))

    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith(["terms", "privacy"])
    })

    // Refetches rather than assuming — the server recomputes what is pending.
    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalled()
      expect(useLegalConsentStore.getState().open).toBe(false)
    })
  })

  it("stays up and explains itself when the accept fails", async () => {
    mockAccept.mockRejectedValue(new Error("network"))
    renderModal()

    fireEvent.click(screen.getByRole("button", { name: /i agree/i }))

    await waitFor(() => {
      expect(screen.getByRole("alert", { name: "" }).textContent).toBeTruthy()
    })

    // Still blocking: the server has not recorded anything.
    expect(useLegalConsentStore.getState().open).toBe(true)
    expect(screen.getByRole("button", { name: /i agree/i })).toBeTruthy()
  })

  it("closes if the refetch fails but the acceptance succeeded", async () => {
    mockGetUser.mockRejectedValue(new Error("offline"))
    renderModal()

    fireEvent.click(screen.getByRole("button", { name: /i agree/i }))

    // The consent is on file; keeping the user behind the modal because a
    // follow-up read failed would block them on something already done.
    await waitFor(() => {
      expect(useLegalConsentStore.getState().open).toBe(false)
    })
  })
})

describe("the documents", () => {
  it("links every pending document, and only those", () => {
    useLegalConsentStore.setState({ pendingDocuments: ["terms"], open: true })
    renderModal()

    const terms = screen.getByRole("link", { name: /terms of service/i })
    expect(terms.getAttribute("href")).toBe("/terms")
    expect(terms.getAttribute("target")).toBe("_blank")

    expect(screen.queryByRole("link", { name: /privacy policy/i })).toBeNull()
  })

  it("opens them in a new tab so the modal survives the reading", () => {
    renderModal()

    for (const name of [/terms of service/i, /privacy policy/i]) {
      const link = screen.getByRole("link", { name })
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toContain("noopener")
    }
  })
})

describe("accessibility", () => {
  it("is a modal dialog with a name and a description", () => {
    renderModal()

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")

    const labelId = dialog.getAttribute("aria-labelledby")
    const describedId = dialog.getAttribute("aria-describedby")
    expect(document.getElementById(labelId ?? "")?.textContent).toBeTruthy()
    expect(document.getElementById(describedId ?? "")?.textContent).toBeTruthy()
  })

  it("announces itself assertively", () => {
    renderModal()

    const live = document
      .querySelector('[aria-live="assertive"]')

    expect(live?.textContent).toMatch(/updated our terms/i)
  })

  it("moves focus into the dialog", async () => {
    renderModal()

    await waitFor(() => {
      const dialog = screen.getByRole("dialog")
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })
})

describe("store behaviour", () => {
  it("ignores a repeat require for the same documents", () => {
    const { require } = useLegalConsentStore.getState()

    require(["terms"])
    const first = useLegalConsentStore.getState()
    require(["terms"])

    // A page firing several writes at once answers 403 several times; that has
    // to be one modal, not a re-render per failed request.
    expect(useLegalConsentStore.getState().pendingDocuments).toBe(
      first.pendingDocuments,
    )
  })

  it("ignores an empty pending list", () => {
    useLegalConsentStore.setState({ pendingDocuments: [], open: false })

    useLegalConsentStore.getState().require([])

    expect(useLegalConsentStore.getState().open).toBe(false)
  })
})

describe("auth store", () => {
  it("carries the legal block through updateUser", () => {
    useAuthStore.setState({ user: { id: "u1", username: "p" } })

    useAuthStore.getState().updateUser({
      id: "u1",
      username: "p",
      legal: {
        pending_documents: ["terms"],
        requires_acceptance: true,
        accepted_versions: { terms: "2020-01-01", privacy: "2026-10-01" },
      },
    })

    expect(useAuthStore.getState().user?.legal?.pending_documents).toEqual([
      "terms",
    ])
  })
})
