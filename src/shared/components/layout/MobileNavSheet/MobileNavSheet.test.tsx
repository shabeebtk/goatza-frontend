// @vitest-environment jsdom

/**
 * MobileNavSheet — the nav dock: what it renders and the ways out of it.
 *
 * The drag itself is not under test: it is pointer geometry against a live
 * layout, and jsdom has neither (every element measures 0×0, so the body's
 * travel distance — and therefore the gesture — is zero, and ResizeObserver
 * does not exist). What IS under test is everything reachable without a
 * gesture: the bar's five tabs living inside the dock, the grouped tiles, the
 * dimmed coming-soon tile, the inline accounts list, Escape, the backdrop, a
 * tile tap, the focus contract and the one-time hint.
 *
 * useBackToClose is mocked to call onClose straight through. The real hook
 * routes every close via history.back() and an asynchronous popstate, and it
 * has its own suite (useBackToClose.test.tsx) — threading that through here
 * would make these assertions about history rather than about the dock.
 *
 * Plain DOM assertions — jest-dom is not set up in this project (same note as
 * features/join/components/JoinPage.test.tsx).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import MobileNavSheet, {
  type NavDockTab,
  type NavSheetGroup,
  type NavSheetTile,
} from "./MobileNavSheet"
import type { OrganizationActor, User } from "@/store/auth.store"

const push = vi.fn()
const navigateAway = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

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

vi.mock("@/shared/hooks/useBackToClose", () => ({
  useBackToClose: (onClose: () => void) => ({
    requestClose: onClose,
    navigateAway: (href: string) => {
      navigateAway(href)
      onClose()
    },
  }),
}))

const TOURNAMENTS: NavSheetTile = {
  id: "tournaments",
  label: "Tournaments",
  href: "/tournaments",
  icon: "mdi:trophy-outline",
  iconActive: "mdi:trophy",
  disabled: true,
  comingSoon: true,
}

const SECTIONS: NavSheetGroup[] = [
  {
    id: "discover",
    title: "Discover",
    items: [
      { id: "home", label: "Home", href: "/home", icon: "i", iconActive: "i" },
      { id: "explore", label: "Explore", href: "/explore", icon: "i", iconActive: "i" },
      TOURNAMENTS,
    ],
  },
  {
    id: "you",
    title: "You",
    items: [
      {
        id: "messages",
        label: "Messages",
        href: "/messages",
        icon: "i",
        iconActive: "i",
        badge: 3,
      },
      { id: "saved", label: "Saved", href: "/settings/saved", icon: "i", iconActive: "i" },
    ],
  },
]

const FOOTER: NavSheetTile[] = [
  { id: "settings", label: "Settings", href: "/settings", icon: "i", iconActive: "i" },
  { id: "help", label: "Help", href: "/report-problem", icon: "i", iconActive: "i" },
]

const onCreate = vi.fn()

const TABS: NavDockTab[] = [
  { kind: "link", id: "home", label: "Home", href: "/home", icon: "i", iconActive: "i" },
  {
    kind: "link",
    id: "recruitments",
    label: "Recruitments",
    href: "/recruitments",
    icon: "i",
    iconActive: "i",
  },
  { kind: "create", id: "create", label: "Create post", icon: "mdi:plus", onSelect: onCreate },
  {
    kind: "link",
    id: "messages",
    label: "Messages",
    href: "/messages",
    icon: "i",
    iconActive: "i",
    badge: 3,
  },
  {
    kind: "profile",
    id: "profile",
    label: "Profile",
    href: "/profile/shabeeb",
    match: "/profile",
    initials: "AD",
  },
]

function org(id: string, name: string, username: string): OrganizationActor {
  return { id, name, username, type: "club", logo: "", headline: "", is_verified: false }
}

const USER: User = { id: "u1", username: "shabeeb", name: "shabeeb" }

const ORGS: OrganizationActor[] = [
  org("org-1", "Dream FC Calicut", "dreamfc"),
  org("org-2", "Kannur Strikers FC", "strikers"),
]

type SheetProps = React.ComponentProps<typeof MobileNavSheet>

function props(overrides: Partial<SheetProps> = {}): SheetProps {
  return {
    open: true,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    tabs: TABS,
    sections: SECTIONS,
    footerItems: FOOTER,
    pathname: "/home",
    account: { name: "shabeeb", initials: "SH", roleLabel: "Player · Switch account" },
    mode: "user",
    actorType: "user",
    actorId: "u1",
    organizations: [],
    user: USER,
    onSwitchToUser: vi.fn(),
    onSwitchToOrganization: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  }
}

function renderDock(overrides: Partial<SheetProps> = {}) {
  const onClose = vi.fn()
  const onOpen = vi.fn()
  const onLogout = vi.fn()
  const onSwitchToUser = vi.fn()
  const onSwitchToOrganization = vi.fn()
  const all = props({ onClose, onOpen, onLogout, onSwitchToUser, onSwitchToOrganization, ...overrides })

  return {
    ...render(<MobileNavSheet {...all} />),
    onClose,
    onOpen,
    onLogout,
    onSwitchToUser,
    onSwitchToOrganization,
  }
}

/** The body — the element that moves, and that carries inert when collapsed. */
function bodyEl() {
  return screen.getByRole("dialog", { hidden: true }).parentElement!
}

/** The dock — the one fixed container that holds the body AND the bar. */
function dockEl() {
  return bodyEl().parentElement!
}

beforeEach(() => {
  window.localStorage.clear()
  // Storage starts empty, so the hint would arm itself in every test; say it
  // has been seen except where the hint is what is under test.
  window.localStorage.setItem("goatza:nav-sheet-hint-seen", "1")
})

afterEach(() => {
  cleanup()
  push.mockReset()
  navigateAway.mockReset()
  onCreate.mockReset()
  vi.useRealTimers()
})

describe("one container", () => {
  it("holds the bar's five tabs and the sheet body in the same dock", () => {
    renderDock()

    const dock = dockEl()
    const bar = screen.getByRole("navigation", { name: "Tab navigation" })

    // The bar is INSIDE the dock, not a fixed element of its own beside it.
    expect(dock.contains(bar)).toBe(true)
    expect(dock.contains(bodyEl())).toBe(true)
    // ...and it is the dock's last child: the footer, under the body.
    expect(dock.lastElementChild).toBe(bar)

    expect(bar.children).toHaveLength(5)
  })

  it("keeps the tabs usable while the body is expanded", () => {
    const { onClose } = renderDock()

    const bar = screen.getByRole("navigation", { name: "Tab navigation" })
    const home = screen.getAllByRole("link", { name: "Home" }).find((el) => bar.contains(el))!

    fireEvent.click(home)

    // A tab tap navigates AND collapses the dock.
    expect(navigateAway).toHaveBeenCalledWith("/home")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("leaves the create button to its own handler, collapsing first", () => {
    const { onClose } = renderDock()

    fireEvent.click(screen.getByRole("button", { name: "Create post" }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(navigateAway).not.toHaveBeenCalled()
  })

  it("has no grabber above the bar any more", () => {
    renderDock({ open: false })

    expect(screen.queryByText("Swipe up for all")).toBeNull()
    // Nothing on the bar opens the dock any more: the swipe up is the one
    // way in, so no tab claims to be a disclosure.
    expect(screen.queryByRole("button", { name: "Navigation menu" })).toBeNull()
    expect(document.querySelector("[aria-haspopup]")).toBeNull()
  })

  it("sends the profile tab to the profile, not to the dock", () => {
    const { onOpen } = renderDock({ open: false })

    const tab = screen.getByRole("link", { name: "Profile" })
    expect(tab.getAttribute("href")).toBe("/profile/shabeeb")
    // Not a disclosure any more.
    expect(tab.getAttribute("aria-haspopup")).toBeNull()
    expect(tab.getAttribute("aria-expanded")).toBeNull()
    expect(tab.getAttribute("aria-controls")).toBeNull()

    fireEvent.click(tab)

    // Collapsed, there is no overlay entry to consume: a plain push.
    expect(push).toHaveBeenCalledWith("/profile/shabeeb")
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("renders nothing at all where the chrome is hidden", () => {
    const { container } = renderDock({ visible: false })
    expect(container.firstChild).toBeNull()
  })
})

describe("expanded and collapsed", () => {
  it("is a modal dialog with a name when expanded", () => {
    renderDock()

    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(
      document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent
    ).toBe("Navigation")
  })

  it("holds the body inert and out of the a11y tree while collapsed", () => {
    renderDock({ open: false })

    const body = bodyEl()
    expect(body.hasAttribute("inert")).toBe(true)
    expect(body.getAttribute("aria-hidden")).toBe("true")
    expect(body.getAttribute("data-state")).toBe("closed")
    // Still mounted, because a drag has to be able to pull it into view.
    expect(screen.getByRole("dialog", { hidden: true })).toBeTruthy()
  })

  it("drops inert once expanded", () => {
    renderDock()

    const body = bodyEl()
    expect(body.hasAttribute("inert")).toBe(false)
    expect(body.hasAttribute("aria-hidden")).toBe(false)
    expect(body.getAttribute("data-state")).toBe("open")
  })
})

describe("what the body renders", () => {
  it("shows both group headings and every tile", () => {
    renderDock()

    expect(screen.getByRole("heading", { name: "Discover" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "You" })).toBeTruthy()

    for (const label of ["Home", "Explore", "Tournaments", "Saved"]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it("shows the account header", () => {
    renderDock()

    expect(screen.getByText("shabeeb")).toBeTruthy()
    expect(screen.getByText("Player · Switch account")).toBeTruthy()
  })

  it("renders the footer row and Log out", () => {
    renderDock()

    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Help" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy()
  })

  it("marks the current route, and only the longest match", () => {
    renderDock({ pathname: "/settings/saved" })

    expect(screen.getByRole("link", { name: "Saved" }).getAttribute("aria-current")).toBe("page")
    // /settings is a prefix of /settings/saved — it must not also light up.
    expect(screen.getByRole("link", { name: "Settings" }).hasAttribute("aria-current")).toBe(false)
  })
})

describe("a coming-soon tile", () => {
  it("is not a link and is not focusable", () => {
    renderDock()

    expect(screen.queryByRole("link", { name: /Tournaments/ })).toBeNull()
    const tile = screen.getByLabelText("Tournaments — coming soon")
    expect(tile.tagName).toBe("SPAN")
    expect(tile.hasAttribute("href")).toBe(false)
    expect(tile.hasAttribute("tabindex")).toBe(false)
  })

  it("says it is aria-disabled and carries the Soon chip", () => {
    renderDock()

    const tile = screen.getByLabelText("Tournaments — coming soon")
    expect(tile.getAttribute("aria-disabled")).toBe("true")
    expect(tile.textContent).toContain("Soon")
  })

  it("does not navigate or collapse when tapped", () => {
    const { onClose } = renderDock()

    fireEvent.click(screen.getByLabelText("Tournaments — coming soon"))

    expect(navigateAway).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe("the accounts list", () => {
  function openSwitcher(overrides: Partial<SheetProps> = {}) {
    const api = renderDock({ organizations: ORGS, ...overrides })
    fireEvent.click(screen.getByText("Player · Switch account"))
    return api
  }

  it("is collapsed until the account header is tapped", () => {
    renderDock({ organizations: ORGS })

    expect(screen.queryByRole("group", { name: "Switch account" })).toBeNull()
    fireEvent.click(screen.getByText("Player · Switch account"))
    expect(screen.getByRole("group", { name: "Switch account" })).toBeTruthy()
  })

  it("lists the personal account, then every org, then Create a page", () => {
    openSwitcher()

    const list = screen.getByRole("group", { name: "Switch account" })
    const rows = Array.from(list.children).map((row) => row.textContent)

    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain("shabeeb")
    expect(rows[0]).toContain("Personal account")
    expect(rows[1]).toContain("Dream FC Calicut")
    expect(rows[1]).toContain("Organization")
    expect(rows[2]).toContain("Kannur Strikers FC")
    // The last row of the SAME list, not a section of its own.
    expect(rows[3]).toContain("Create a page")
    expect(list.lastElementChild?.getAttribute("href")).toBe("/organization/create")
  })

  it("marks the current actor and nothing else", () => {
    openSwitcher()

    const list = screen.getByRole("group", { name: "Switch account" })
    const current = Array.from(list.querySelectorAll('[aria-current="true"]'))

    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain("shabeeb")
  })

  it("marks the acting org when that is the actor", () => {
    openSwitcher({ actorType: "organization", actorId: "org-2", mode: "organization" })

    const current = screen.getByRole("group", { name: "Switch account" })
      .querySelector('[aria-current="true"]')

    expect(current?.textContent).toContain("Kannur Strikers FC")
  })

  it("offers the way back to personal when acting as an org", () => {
    openSwitcher({ actorType: "organization", actorId: "org-1", mode: "organization" })

    expect(screen.getByText("Switch to personal")).toBeTruthy()
  })

  it("switches on a row tap, collapsing the list", () => {
    const { onSwitchToOrganization } = openSwitcher()

    fireEvent.click(screen.getByText("Dream FC Calicut"))

    expect(onSwitchToOrganization).toHaveBeenCalledWith("org-1")
    expect(screen.queryByRole("group", { name: "Switch account" })).toBeNull()
  })

  it("switches back to personal on that row", () => {
    const { onSwitchToUser } = openSwitcher({
      actorType: "organization",
      actorId: "org-1",
      mode: "organization",
    })

    fireEvent.click(screen.getByText("Switch to personal"))

    expect(onSwitchToUser).toHaveBeenCalledTimes(1)
  })

  it("holds no Settings or Log out of its own — the footer has those", () => {
    openSwitcher()

    const list = screen.getByRole("group", { name: "Switch account" })
    expect(list.textContent).not.toContain("Settings")
    expect(list.textContent).not.toContain("Log out")
    // Exactly one of each, in the footer.
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Log out" })).toHaveLength(1)
  })
})

describe("the ways out", () => {
  it("collapses on Escape", () => {
    const { onClose } = renderDock()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("ignores Escape while already collapsed", () => {
    const { onClose } = renderDock({ open: false })

    fireEvent.keyDown(document, { key: "Escape" })

    expect(onClose).not.toHaveBeenCalled()
  })

  it("collapses when the backdrop is tapped", () => {
    const { onClose, container } = renderDock()

    const backdrop = container.querySelector('[aria-hidden="true"][data-state="open"]')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("has no close button in the handle — four ways out is enough", () => {
    renderDock()

    // Drag down, backdrop, back gesture, Esc. A fifth control only took
    // room from the handle that teaches the first.
    expect(screen.queryByRole("button", { name: "Close navigation menu" })).toBeNull()
    expect(document.querySelector('[data-icon="mdi:close"]')).toBeNull()
  })

  it("keeps the dialog named without it", () => {
    renderDock()

    const dialog = screen.getByRole("dialog")
    const labelId = dialog.getAttribute("aria-labelledby")
    expect(labelId).toBeTruthy()
    expect(document.getElementById(labelId!)?.textContent).toBe("Navigation")
  })

  it("leaves by the profile tab while expanded, consuming the entry", () => {
    const { onClose } = renderDock()

    fireEvent.click(screen.getByRole("link", { name: "Profile" }))

    // Expanded, it leaves the way every other tile does.
    expect(navigateAway).toHaveBeenCalledWith("/profile/shabeeb")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("navigates and collapses on a tile tap, consuming its history entry", () => {
    const { onClose } = renderDock()

    fireEvent.click(screen.getByRole("link", { name: "Explore" }))

    // navigateAway, not a bare push: it pops the dock's entry before the
    // push, so back from the destination returns to the page.
    expect(navigateAway).toHaveBeenCalledWith("/explore")
    expect(push).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("leaves a modified click to the browser", () => {
    const { onClose } = renderDock()

    fireEvent.click(screen.getByRole("link", { name: "Explore" }), { metaKey: true })

    expect(navigateAway).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("collapses and asks before logging out", () => {
    const { onClose, onLogout, rerender } = renderDock()

    fireEvent.click(screen.getByRole("button", { name: "Log out" }))

    // The dock goes down first — the question is asked on an empty screen,
    // not on top of the menu.
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()

    // The parent owns `open`, so mirror the collapse it would commit.
    rerender(<MobileNavSheet {...props({ open: false, onClose, onLogout })} />)

    const dialog = screen.getByRole("alertdialog")
    expect(dialog.textContent).toContain("Log out?")
    expect(onLogout).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Log out" }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it("lets the reader back out of logging out", () => {
    const { onClose, onLogout, rerender } = renderDock()

    fireEvent.click(screen.getByRole("button", { name: "Log out" }))
    rerender(<MobileNavSheet {...props({ open: false, onClose, onLogout })} />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})

describe("focus", () => {
  it("moves into the body when it expands", () => {
    renderDock()

    expect(document.activeElement).toBe(screen.getByRole("dialog"))
  })

  it("hands focus back to whatever had it when it collapses", () => {
    const onOpen = vi.fn()
    const { rerender } = render(<MobileNavSheet {...props({ open: false, onOpen })} />)

    // The dock opens by dragging the bar up, so there is no opener button to
    // record: the focus contract is "wherever the reader was".
    const tab = screen.getByRole("link", { name: "Home" })
    tab.focus()

    // The parent owns `open`, so mirror the state change the drag would make.
    rerender(<MobileNavSheet {...props({ open: true, onOpen })} />)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))

    rerender(<MobileNavSheet {...props({ open: false, onOpen })} />)
    expect(document.activeElement).toBe(screen.getAllByRole("link", { name: "Home" })[0])
  })

  it("traps Tab inside the body", () => {
    renderDock()

    const dialog = screen.getByRole("dialog")
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
    )
    expect(focusable.length).toBeGreaterThan(1)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    last.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})

describe("the one-time hint", () => {
  const HINT_KEY = "goatza:nav-sheet-hint-seen"

  beforeEach(() => {
    // These tests are the ones that WANT an unseen hint.
    window.localStorage.clear()
    vi.useFakeTimers()
  })

  it("holds off until the page has settled, then names the gesture", () => {
    renderDock({ open: false })

    expect(screen.queryByText("Swipe up for more")).toBeNull()

    act(() => void vi.advanceTimersByTime(1200))

    expect(screen.getByText("Swipe up for more")).toBeTruthy()
  })

  it("gets out of the way on its own", () => {
    renderDock({ open: false })

    act(() => void vi.advanceTimersByTime(1200))
    expect(screen.getByText("Swipe up for more")).toBeTruthy()

    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.queryByText("Swipe up for more")).toBeNull()
  })

  it("goes the moment the bar is touched", () => {
    renderDock({ open: false })
    act(() => void vi.advanceTimersByTime(1200))

    fireEvent.pointerDown(screen.getByRole("navigation", { name: "Tab navigation" }))

    expect(screen.queryByText("Swipe up for more")).toBeNull()
  })

  it("remembers, so it never plays twice", () => {
    renderDock({ open: false })
    act(() => void vi.advanceTimersByTime(1200))

    expect(window.localStorage.getItem(HINT_KEY)).toBe("1")

    cleanup()
    renderDock({ open: false })
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.queryByText("Swipe up for more")).toBeNull()
  })

  it("never plays once the dock has been opened", () => {
    renderDock({ open: true })

    act(() => void vi.advanceTimersByTime(5000))

    expect(screen.queryByText("Swipe up for more")).toBeNull()
  })

  it("stays quiet where the chrome is hidden", () => {
    renderDock({ open: false, visible: false })

    act(() => void vi.advanceTimersByTime(5000))

    expect(screen.queryByText("Swipe up for more")).toBeNull()
    expect(window.localStorage.getItem(HINT_KEY)).toBeNull()
  })
})
