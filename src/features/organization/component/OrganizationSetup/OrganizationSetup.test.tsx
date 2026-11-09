// @vitest-environment jsdom

/**
 * The create-a-page flow, driven through the screen. The router is a small
 * in-memory history (push / replace / back move one list, useSearchParams
 * reads the current entry), so "the phone's back gesture" is `nav.back()`.
 * The network is the mocked api functions; the cropper hands back a blob at
 * once; ConfirmDialog is reduced to its two buttons.
 *
 * Only `Date` is faked: the footer's primary button ignores taps for
 * STEP_TAP_GUARD_MS after a step appears, so `tapPrimary` moves the clock
 * past that first, like a person would. Timers stay real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import OrganizationSetup, { STEP_TAP_GUARD_MS } from "./OrganizationSetup"
import { DRAFT_STORAGE_KEY, EMPTY_DRAFT, type CreateDraft } from "./createPageDraft"
import { CREATE_ORG_CONNECTION_MESSAGE, CreateOrgError } from "../../services/organization.api"
import { createEligibilityKey, orgKeys } from "../../hooks/useOrganizations"
import type { OrganizationMini } from "../../types"
import { useAuthStore } from "@/store/auth.store"

// ── Router: an in-memory history ──────────────────────────────────

const nav = vi.hoisted(() => {
  let entries: string[] = ["/organization/create"]
  let index = 0
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  return {
    reset(url: string) {
      entries = [url]
      index = 0
    },
    current: () => entries[index],
    entries: () => entries.slice(),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    push: vi.fn((url: string) => {
      entries = entries.slice(0, index + 1)
      entries.push(url)
      index += 1
      notify()
    }),
    replace: vi.fn((url: string) => {
      entries[index] = url
      notify()
    }),
    back: vi.fn(() => {
      if (index > 0) {
        index -= 1
        notify()
      }
    }),
  }
})

vi.mock("next/navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  const router = {
    push: (url: string) => nav.push(url),
    replace: (url: string) => nav.replace(url),
    back: () => nav.back(),
    prefetch: () => undefined,
    refresh: () => undefined,
    forward: () => undefined,
  }
  return {
    useRouter: () => router,
    usePathname: () => nav.current().split("?")[0],
    useSearchParams: () => {
      const url = React.useSyncExternalStore(nav.subscribe, nav.current, nav.current)
      return new URLSearchParams(url.split("?")[1] ?? "")
    },
  }
})

const step = () => new URLSearchParams(nav.current().split("?")[1] ?? "").get("step")

// ── Everything else this screen talks to ──────────────────────────

const mocks = vi.hoisted(() => ({
  createOrganizationApi: vi.fn(),
  getCreateEligibilityApi: vi.fn(),
  getOrganizationsApi: vi.fn(),
  getMyOrganizationsAsPersonApi: vi.fn(),
  uploadOrgPhoto: vi.fn(),
  smartBack: vi.fn(),
  /** What hasInAppHistory() answers: false = opened directly. */
  inAppHistory: false,
  /** Whether the picked-town pill offers its clear button. */
  pickerClearable: true,
  checkUsernameApi: vi.fn(),
  toastShow: vi.fn(),
  wakeLock: vi.fn(),
  place: {
    provider: "google",
    place_type: "city",
    label: "Kannur, Kerala, India",
    name: "Kannur",
    city: "Kannur",
    state: "Kerala",
    country: "India",
    country_code: "IN",
    latitude: 11.87,
    longitude: 75.37,
    external_id: "place-kannur",
    types: ["locality"],
  },
}))

vi.mock("../../services/organization.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/organization.api")>()),
  createOrganizationApi: mocks.createOrganizationApi,
  getCreateEligibilityApi: mocks.getCreateEligibilityApi,
  getOrganizationsApi: mocks.getOrganizationsApi,
  getMyOrganizationsAsPersonApi: mocks.getMyOrganizationsAsPersonApi,
}))

vi.mock("@/shared/hooks/useSmartBack", () => ({
  useSmartBack: () => mocks.smartBack,
  hasInAppHistory: () => mocks.inAppHistory,
}))

vi.mock("../../services/uploadOrgPhoto", () => ({
  uploadOrgPhoto: mocks.uploadOrgPhoto,
  ORG_PHOTO_UPLOAD_TYPE: { logo: "organization_logo", cover: "organization_cover" },
}))

vi.mock("@/features/profile/services/profile.api", () => ({
  checkUsernameApi: mocks.checkUsernameApi,
}))

const SPORTS = [
  { id: "s-foot", name: "Football", icon_name: "mdi:soccer", icon_url: "", positions: [], attributes: [] },
  { id: "s-cricket", name: "Cricket", icon_name: "mdi:cricket", icon_url: "", positions: [], attributes: [] },
]

vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
  useSportsList: () => ({ data: SPORTS, isPending: false, isError: false, refetch: vi.fn() }),
}))

vi.mock("@/features/profile/hooks/useProfileBias", () => ({ useProfileBias: () => null }))

vi.mock("@/shared/components/ui/Toast/Toast", () => ({
  useToast: () => ({ show: mocks.toastShow, dismiss: vi.fn(), dismissAll: vi.fn() }),
}))

vi.mock("@/shared/hooks/useScreenWakeLock", () => ({ useScreenWakeLock: mocks.wakeLock }))
vi.mock("@/shared/hooks/useVisualViewport", () => ({ useVisualViewport: () => undefined }))

vi.mock("@/shared/services/imageVariants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/services/imageVariants")>()),
  ensureDecodableImage: vi.fn(async (file: File) => file),
}))

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))

// Like the real one: a search input until a town is picked, then a pill with
// a clear button and no input.
vi.mock("@/shared/components/LocationPicker/LocationPicker", () => ({
  default: ({ inputId, value, onChange }: {
    inputId?: string
    value: { label: string } | null
    onChange: (place: unknown) => void
  }) =>
    value ? (
      <div>
        <span>{value.label}</span>
        {mocks.pickerClearable && (
          <button type="button" aria-label="Clear location" onClick={() => onChange(null)} />
        )}
      </div>
    ) : (
      <div>
        <input id={inputId} readOnly value="" />
        <button type="button" onClick={() => onChange(mocks.place)}>Pick Kannur</button>
      </div>
    ),
}))

vi.mock("../OrgPhotoCropSheet/OrgPhotoCropSheet", () => ({
  default: ({ confirmLabel, onDone }: { confirmLabel?: string; onDone: (blob: Blob) => void }) => (
    <button type="button" onClick={() => onDone(new Blob(["cropped"], { type: "image/jpeg" }))}>
      {confirmLabel}
    </button>
  ),
}))

vi.mock("@/shared/components/ui/ConfirmDialog/ConfirmDialog", () => ({
  default: ({ open, title, confirmLabel, cancelLabel, onConfirm, onCancel }: {
    open: boolean
    title: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
    onCancel: () => void
  }) =>
    open ? (
      <div role="alertdialog" aria-label={title}>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" onClick={onCancel}>{cancelLabel}</button>
      </div>
    ) : null,
}))

// ── Helpers ───────────────────────────────────────────────────────

const draftWith = (patch: Partial<CreateDraft>): CreateDraft => ({ ...EMPTY_DRAFT, ...patch })

const FULL_DRAFT = draftWith({
  type: "club",
  name: "Kannur FC",
  username: "kannur_fc",
  headline: "Football for everyone",
})

const seedDraft = (draft: CreateDraft) =>
  window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ v: 1, draft }))

const storedDraft = () => window.sessionStorage.getItem(DRAFT_STORAGE_KEY)

let client: QueryClient

function renderSetup(url = "/organization/create") {
  nav.reset(url)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client = queryClient
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationSetup />
    </QueryClientProvider>
  )
}

const continueButton = () => screen.getByRole("button", { name: "Continue" })
const footerBack = () => {
  const backs = screen.getAllByRole("button", { name: "Back" })
  return backs[backs.length - 1]
}
const handleInput = () => screen.getByLabelText(/^Page link/) as HTMLInputElement
const nameInput = () => screen.getByLabelText(/^Name/) as HTMLInputElement

/** A tap on the footer's primary button, well after its step appeared. */
const tapPrimary = (button: HTMLElement) => {
  vi.setSystemTime(Date.now() + STEP_TAP_GUARD_MS + 100)
  fireEvent.click(button)
}
const createButton = () => screen.getByRole("button", { name: "Create page" })

const typeName = (value: string) => fireEvent.change(nameInput(), { target: { value } })
const typeHandle = (value: string) => fireEvent.change(handleInput(), { target: { value } })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const CREATED = {
  id: "org-new",
  name: "Kannur FC",
  username: "kannur_fc",
  type: "club",
  headline: "Football for everyone",
  logo: "",
}

const ORG_NEW_LISTED: OrganizationMini = {
  id: "org-new", name: "Kannur FC", username: "kannur_fc", type: "club", logo: "",
  headline: "", is_verified: false, my_role: "owner", my_permissions: [],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  mocks.inAppHistory = false
  mocks.pickerClearable = true
  window.sessionStorage.clear()
  useAuthStore.setState({
    organizations: [],
    actorType: "user",
    actorId: null,
    currentOrganization: null,
  })
  mocks.getCreateEligibilityApi.mockResolvedValue({ allowed: true, limit: 3, used: 0 })
  mocks.checkUsernameApi.mockImplementation(async (username: string) => ({
    username,
    valid: true,
    available: true,
  }))
  mocks.getOrganizationsApi.mockResolvedValue([])
  mocks.getMyOrganizationsAsPersonApi.mockResolvedValue([])
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ""
})

// ── Steps and the URL ─────────────────────────────────────────────

describe("steps live in the URL", () => {
  it("reserves the entry under step 1, then moves forward with push", async () => {
    renderSetup()

    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))
    expect(nav.entries()).toEqual(["/organization/create", "/organization/create?step=type"])
    expect(screen.getByText("Step 1 of 4")).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: /^Club/ }))
    tapPrimary(continueButton())

    await waitFor(() => expect(step()).toBe("basics"))
    expect(await screen.findByRole("heading", { name: "The basics" })).toBeTruthy()
    expect(screen.getByText("Step 2 of 4")).toBeTruthy()
  })

  it("goes back a step on the phone's back gesture and on the page's Back", async () => {
    seedDraft(FULL_DRAFT)
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))

    tapPrimary(continueButton())
    await screen.findByRole("heading", { name: "The basics" })
    tapPrimary(continueButton())
    await screen.findByRole("heading", { name: "Location & sports" })

    // The gesture: the browser goes back one entry.
    act(() => nav.back())
    expect(await screen.findByRole("heading", { name: "The basics" })).toBeTruthy()
    expect(step()).toBe("basics")

    // The page's own Back walks history too, rather than pushing.
    fireEvent.click(footerBack())
    expect(nav.back).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole("heading", { name: "What kind of page?" })).toBeTruthy()
  })

  it("moves focus to the new step's heading", async () => {
    seedDraft(FULL_DRAFT)
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))

    tapPrimary(continueButton())
    const heading = await screen.findByRole("heading", { name: "The basics" })

    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(heading.getAttribute("tabindex")).toBe("-1")
  })

  it("sends a deep link past missing data to the first incomplete step", async () => {
    seedDraft(draftWith({ type: "team" }))
    renderSetup("/organization/create?step=review")

    await waitFor(() => expect(step()).toBe("basics"))
    expect(nav.replace).toHaveBeenCalledWith("/organization/create?step=basics")
    expect(await screen.findByRole("heading", { name: "The basics" })).toBeTruthy()
  })
})

// ── Step 1 ────────────────────────────────────────────────────────

describe("the type step", () => {
  it("is a radiogroup with one tab stop that arrow keys move through", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })

    const group = screen.getByRole("radiogroup")
    const radios = within(group).getAllByRole("radio")
    expect(radios).toHaveLength(4)
    expect(radios.map((radio) => radio.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"])
    expect(continueButton().hasAttribute("disabled")).toBe(true)

    radios[0].focus()
    fireEvent.keyDown(radios[0], { key: "ArrowDown" })

    const after = within(group).getAllByRole("radio")
    expect(after[1].getAttribute("aria-checked")).toBe("true")
    expect(after[0].getAttribute("aria-checked")).toBe("false")
    expect(document.activeElement).toBe(after[1])
    expect(after[1].getAttribute("tabindex")).toBe("0")
    expect(continueButton().hasAttribute("disabled")).toBe(false)

    fireEvent.keyDown(after[1], { key: "ArrowUp" })
    expect(within(group).getAllByRole("radio")[0].getAttribute("aria-checked")).toBe("true")
  })
})

// ── Step 2: the page link ─────────────────────────────────────────

describe("the page link", () => {
  const openBasics = async (draft: CreateDraft = draftWith({ type: "club" })) => {
    seedDraft(draft)
    renderSetup("/organization/create?step=basics")
    await screen.findByRole("heading", { name: "The basics" })
  }

  it("follows the name until it is edited", async () => {
    await openBasics()

    typeName("Kannur FC Academy")
    expect(handleInput().value).toBe("kannur_fc_academy")

    typeHandle("KFC Academy")
    expect(handleInput().value).toBe("kfc_academy")

    typeName("Kannur Football Club")
    expect(handleInput().value).toBe("kfc_academy")
  })

  it("shows the domain and asks the server about a page, not a person", async () => {
    await openBasics()
    typeName("Kannur FC")

    expect(screen.getByText("goatza.com/")).toBeTruthy()
    await screen.findByText("Available")
    expect(mocks.checkUsernameApi).toHaveBeenCalledWith("kannur_fc", { for: "organization" })
  })

  it("says Checking…, Available, Taken with a suggestion, and why it is invalid", async () => {
    mocks.checkUsernameApi.mockImplementation(async (username: string) => {
      if (username === "taken_one") {
        return { username, valid: true, available: false, suggestion: "taken_one42" }
      }
      if (username === "server_says_no") {
        return { username, valid: false, available: false, message: "This username is not allowed" }
      }
      return { username, valid: true, available: true }
    })
    await openBasics()

    typeHandle("fresh_club")
    expect(screen.getByText("Checking…")).toBeTruthy()
    await screen.findByText("Available")

    typeHandle("taken_one")
    await screen.findByText("Taken.")
    const suggestion = screen.getByRole("button", { name: "Use @taken_one42" })
    expect(handleInput().getAttribute("aria-invalid")).toBe("true")

    fireEvent.click(suggestion)
    expect(handleInput().value).toBe("taken_one42")
    await screen.findByText("Available")

    // The shared validator answers without a request.
    const callsBefore = mocks.checkUsernameApi.mock.calls.length
    typeHandle("ab")
    expect(screen.getByText("Username must be at least 3 characters")).toBeTruthy()
    expect(mocks.checkUsernameApi.mock.calls.length).toBe(callsBefore)

    typeHandle("server_says_no")
    await screen.findByText("This username is not allowed")

    // The status line is live and is what the input is described by.
    const status = document.getElementById("org-create-username-status")!
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(handleInput().getAttribute("aria-describedby")).toContain("org-create-username-status")
  })

  it("Continue waits for the check and stops on a taken link", async () => {
    const answer = deferred<{ username: string; valid: boolean; available: boolean }>()
    mocks.checkUsernameApi.mockImplementation(() => answer.promise)
    await openBasics(draftWith({ type: "club", name: "Kannur FC" }))

    typeHandle("kannur_fc")
    tapPrimary(continueButton())

    // Still here while the answer is out.
    expect(step()).toBe("basics")
    await act(async () => {
      answer.resolve({ username: "kannur_fc", valid: true, available: false })
      await answer.promise
    })

    await waitFor(() => expect(document.activeElement).toBe(handleInput()))
    expect(step()).toBe("basics")
    expect(screen.getByText("Taken.")).toBeTruthy()
  })
})

// ── Validation ────────────────────────────────────────────────────

describe("validation", () => {
  it("shows the error on Continue, ties it to the field and focuses it", async () => {
    seedDraft(draftWith({ type: "club" }))
    renderSetup("/organization/create?step=basics")
    await screen.findByRole("heading", { name: "The basics" })

    tapPrimary(continueButton())

    expect(await screen.findByText("Enter your page's name")).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(nameInput()))
    expect(nameInput().getAttribute("aria-invalid")).toBe("true")
    expect(nameInput().getAttribute("aria-describedby")).toContain("org-create-name-error")
    expect(step()).toBe("basics")

    // Fixing it clears it as it is typed.
    typeName("Kannur FC")
    expect(screen.queryByText("Enter your page's name")).toBeNull()
  })

  it("checks a field on blur, and adds https:// to a website", async () => {
    seedDraft(draftWith({ type: "club", name: "Kannur FC", website: "kannurfc.in" }))
    renderSetup("/organization/create?step=basics")
    await screen.findByRole("heading", { name: "The basics" })

    // "More about your page" opens itself for a restored website.
    const website = screen.getByLabelText(/^Website/) as HTMLInputElement
    fireEvent.blur(website)
    expect(website.value).toBe("https://kannurfc.in")

    fireEvent.change(website, { target: { value: "not a site" } })
    fireEvent.blur(website)
    expect(await screen.findByText("Enter a web address, like yourclub.com")).toBeTruthy()

    typeName("")
    fireEvent.blur(nameInput())
    expect(screen.getByText("Enter your page's name")).toBeTruthy()
  })
})

// ── The draft ─────────────────────────────────────────────────────

describe("the draft", () => {
  it("is restored on reload, photos aside", async () => {
    seedDraft(draftWith({
      type: "academy",
      name: "Kochi Academy",
      username: "kochi_academy",
      city: mocks.place as unknown as CreateDraft["city"],
      sportIds: ["s-cricket", "s-foot"],
    }))
    renderSetup("/organization/create?step=location")

    expect(await screen.findByRole("heading", { name: "Location & sports" })).toBeTruthy()
    expect(screen.getByText("Kannur, Kerala, India")).toBeTruthy()
    // The first sport picked is the primary.
    const cricket = screen.getByRole("button", { name: /Cricket/ })
    expect(cricket.getAttribute("aria-pressed")).toBe("true")
    expect(within(cricket).getByText("Primary")).toBeTruthy()
  })

  it("is saved as it changes", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })

    fireEvent.click(screen.getByRole("radio", { name: /^School/ }))

    await waitFor(() => expect(JSON.parse(storedDraft()!).draft.type).toBe("school"))
  })
})

// ── Leaving ───────────────────────────────────────────────────────

describe("leaving with something entered", () => {
  it("asks on back from step 1, and Keep editing puts step 1 back", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))
    fireEvent.click(screen.getByRole("radio", { name: /^Club/ }))

    act(() => nav.back())
    const dialog = await screen.findByRole("alertdialog", { name: "Discard this page?" })

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }))
    await waitFor(() => expect(step()).toBe("type"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(storedDraft()).not.toBeNull()
  })

  it("Discard clears the draft and leaves", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))
    fireEvent.click(screen.getByRole("radio", { name: /^Club/ }))
    await waitFor(() => expect(storedDraft()).not.toBeNull())

    // The page's own Back on step 1 goes through the entry beneath it.
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Discard this page?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }))

    expect(storedDraft()).toBeNull()
    // Opened directly: nothing of the app's beneath, so /home in its place.
    expect(nav.replace).toHaveBeenLastCalledWith("/home")
  })

  it("does not ask when nothing was entered", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))

    act(() => nav.back())

    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/home"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("asks before a link takes the page away", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))
    fireEvent.click(screen.getByRole("radio", { name: /^Club/ }))

    const link = document.createElement("a")
    link.href = "/explore"
    link.textContent = "Explore"
    document.body.appendChild(link)
    fireEvent.click(link)

    const dialog = await screen.findByRole("alertdialog", { name: "Discard this page?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }))
    expect(nav.push).toHaveBeenLastCalledWith("/explore")
  })
})

// ── Creating ──────────────────────────────────────────────────────

async function fillToReview() {
  renderSetup()
  await screen.findByRole("heading", { name: "What kind of page?" })
  await waitFor(() => expect(step()).toBe("type"))

  fireEvent.click(screen.getByRole("radio", { name: /^Club/ }))
  tapPrimary(continueButton())
  await screen.findByRole("heading", { name: "The basics" })

  typeName("Kannur FC")
  await screen.findByText("Available")

  const photo = (name: string) => new File(["photo"], name, { type: "image/jpeg" })
  fireEvent.change(screen.getByTestId("org-create-logo-input"), { target: { files: [photo("logo.jpg")] } })
  fireEvent.click(await screen.findByRole("button", { name: "Use logo" }))
  fireEvent.change(screen.getByTestId("org-create-cover-input"), { target: { files: [photo("cover.jpg")] } })
  fireEvent.click(await screen.findByRole("button", { name: "Use cover" }))
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Remove cover" })).toBeTruthy()

  tapPrimary(continueButton())
  await screen.findByRole("heading", { name: "Location & sports" })
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }))
  await screen.findByRole("heading", { name: "Review your page" })
}

describe("creating the page", () => {
  it("creates, uploads the logo then the cover, and still lands when a photo fails", async () => {
    const created = deferred<typeof CREATED>()
    mocks.createOrganizationApi.mockReturnValue(created.promise)
    mocks.uploadOrgPhoto.mockImplementation(async ({ type }: { type: string }) => {
      if (type === "cover") throw new Error("PUT failed")
      return "https://media.example.com/organizations/org-new/logo.webp?v=1"
    })
    mocks.getMyOrganizationsAsPersonApi.mockResolvedValue([ORG_NEW_LISTED])

    await fillToReview()
    expect(screen.getByText("You can change all of this later from your page.")).toBeTruthy()
    const clear = vi.spyOn(client, "clear")
    const setData = vi.spyOn(client, "setQueryData")
    const invalidate = vi.spyOn(client, "invalidateQueries")

    tapPrimary(createButton())
    expect(await screen.findByRole("button", { name: "Creating your page…" })).toBeTruthy()
    expect(mocks.wakeLock).toHaveBeenLastCalledWith(true)

    // A second tap while it runs does nothing.
    fireEvent.click(screen.getByRole("button", { name: "Creating your page…" }))
    expect(mocks.createOrganizationApi).toHaveBeenCalledTimes(1)
    expect(mocks.createOrganizationApi).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Kannur FC", type: "club", username: "kannur_fc" })
    )

    await act(async () => {
      created.resolve(CREATED)
      await created.promise
    })

    // Replaced, so back from the dashboard does not reopen an emptied Review.
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/organization/admin/org-new/dashboard")
    )
    expect(nav.push).not.toHaveBeenCalledWith("/organization/admin/org-new/dashboard")

    // As every actor switch: the cache is cleared, THEN the list goes back in
    // for the dashboard's member guard; nothing is forced to refetch.
    expect(clear).toHaveBeenCalledTimes(1)
    const listSet = setData.mock.calls.findIndex(([key]) => JSON.stringify(key) === JSON.stringify(orgKeys.list()))
    expect(listSet).toBeGreaterThanOrEqual(0)
    expect(setData.mock.invocationCallOrder[listSet]).toBeGreaterThan(clear.mock.invocationCallOrder[0])
    expect(client.getQueryData(orgKeys.list())).toEqual([ORG_NEW_LISTED])
    expect(invalidate).not.toHaveBeenCalled()

    expect(mocks.uploadOrgPhoto.mock.calls.map(([input]) => [input.type, input.orgId])).toEqual([
      ["logo", "org-new"],
      ["cover", "org-new"],
    ])

    expect(useAuthStore.getState().actorType).toBe("organization")
    expect(useAuthStore.getState().actorId).toBe("org-new")
    expect(storedDraft()).toBeNull()

    const toasts = mocks.toastShow.mock.calls.map(([options]) => options)
    const live = toasts.find((options) => options.variant === "success")
    expect(live.title).toBe("Kannur FC is live")
    expect(live.action.label).toBe("View page")
    act(() => live.action.onClick())
    expect(nav.push).toHaveBeenLastCalledWith("/organization/admin/org-new/profile")

    const warning = toasts.find((options) => options.variant === "warning")
    expect(warning.title).toBe(
      "Your page is live, but the cover didn't upload. Add it from your page."
    )
  })

  it("refuses while offline", async () => {
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    const online = vi.spyOn(Navigator.prototype, "onLine", "get").mockReturnValue(false)
    tapPrimary(createButton())
    online.mockRestore()

    expect(screen.getByRole("alert").textContent).toContain(
      "You're offline. Check your connection and try again."
    )
    expect(mocks.createOrganizationApi).not.toHaveBeenCalled()
  })

  it("a taken link sends the person back to Basics, on the field", async () => {
    mocks.createOrganizationApi.mockRejectedValue(
      new CreateOrgError({ code: "username_taken", message: "Username already taken", field: "username" })
    )
    mocks.checkUsernameApi.mockResolvedValue({
      username: "kannur_fc", valid: true, available: false, suggestion: "kannur_fc7",
    })
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    await waitFor(() => expect(step()).toBe("basics"))
    await waitFor(() => expect(document.activeElement).toBe(handleInput()))
    expect(screen.getByText("That page link was just taken. Pick another one.")).toBeTruthy()
    expect(await screen.findByRole("button", { name: "Use @kannur_fc7" })).toBeTruthy()
  })

  it("the limit answer swaps the form for the limit state", async () => {
    mocks.createOrganizationApi.mockRejectedValue(
      new CreateOrgError({ code: "org_limit", message: "You can create up to 3 pages." })
    )
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    expect(
      await screen.findByRole("heading", { name: "You've reached the limit of 3 pages" })
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create page" })).toBeNull()
  })

  it("field errors from the server land on their field and step", async () => {
    mocks.createOrganizationApi.mockRejectedValue(
      new CreateOrgError({
        code: "invalid",
        message: "Description: Ensure this field has no more than 600 characters.",
        field: "description",
        fields: { description: "Ensure this field has no more than 600 characters." },
      })
    )
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    await waitFor(() => expect(step()).toBe("basics"))
    expect(await screen.findByText("Ensure this field has no more than 600 characters.")).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/^About/))
    )
  })

  it("anything else is the connection sentence, above the footer", async () => {
    mocks.createOrganizationApi.mockRejectedValue(new Error("socket hang up"))
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't create your page. Check your connection and try again."
    )
    expect(step()).toBe("review")
  })
})

// ── Eligibility ───────────────────────────────────────────────────

describe("eligibility", () => {
  it("shows the limit state instead of the form, with the person's pages", async () => {
    mocks.getCreateEligibilityApi.mockResolvedValue({ allowed: false, limit: 3, used: 3 })
    useAuthStore.setState({
      organizations: [
        { id: "org-a", name: "Alpha FC", username: "alpha", type: "club", logo: "", headline: "", is_verified: false },
        { id: "org-b", name: "Beta Academy", username: "beta", type: "academy", logo: "", headline: "", is_verified: false },
      ],
    })
    renderSetup()

    expect(
      await screen.findByRole("heading", { name: "You've reached the limit of 3 pages" })
    ).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Beta Academy/ }))
    expect(useAuthStore.getState().actorId).toBe("org-b")
    expect(nav.push).toHaveBeenLastCalledWith("/organization/admin/org-b/dashboard")
  })
})

// ── Round 2: back, taps, focus, landing ───────────────────────────

describe("back and leaving", () => {
  it("Back from step 1 after Review's Edit returns to Review, without asking", async () => {
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    fireEvent.click(screen.getByRole("button", { name: "Edit type" }))
    await screen.findByRole("heading", { name: "What kind of page?" })
    expect(step()).toBe("type")

    // Step 1's only Back is the header's.
    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    expect(await screen.findByRole("heading", { name: "Review your page" })).toBeTruthy()
    expect(step()).toBe("review")
    expect(nav.back).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alertdialog")).toBeNull()

    // Nothing was discarded: the draft is still kept as it changes.
    fireEvent.click(screen.getByRole("button", { name: "Edit basics" }))
    await screen.findByRole("heading", { name: "The basics" })
    typeName("Kannur FC Academy")
    await waitFor(() =>
      expect(JSON.parse(storedDraft()!).draft.name).toBe("Kannur FC Academy")
    )
  })

  it("opened directly, Back on step 1 with nothing typed puts /home in its place", async () => {
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))

    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/home"))
    expect(mocks.smartBack).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("with an app page beneath, leaving goes back to it", async () => {
    mocks.inAppHistory = true
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))

    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    await waitFor(() => expect(mocks.smartBack).toHaveBeenCalledTimes(1))
    expect(nav.replace).not.toHaveBeenCalledWith("/home")
  })
})

describe("taps the flow must not act on", () => {
  it("ignores the footer's primary button just after a step appears", async () => {
    const created = deferred<typeof CREATED>()
    mocks.createOrganizationApi.mockReturnValue(created.promise)
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=location")
    await screen.findByRole("heading", { name: "Location & sports" })

    tapPrimary(continueButton())
    await screen.findByRole("heading", { name: "Review your page" })

    // The second tap of a double tap on Continue lands on "Create page".
    fireEvent.click(createButton())
    // Give a tap that WAS taken every chance to start (the create is async).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(mocks.createOrganizationApi).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Creating your page…" })).toBeNull()
    expect(step()).toBe("review")

    // A tap once the Review has been on screen does create.
    tapPrimary(createButton())
    await waitFor(() => expect(mocks.createOrganizationApi).toHaveBeenCalledTimes(1))
  })

  it("Back during the page link check: the answer never moves the flow on", async () => {
    const answer = deferred<{ username: string; valid: boolean; available: boolean }>()
    mocks.checkUsernameApi.mockImplementation(() => answer.promise)
    seedDraft(draftWith({ type: "club", name: "Kannur FC", username: "kannur_fc" }))
    renderSetup()
    await screen.findByRole("heading", { name: "What kind of page?" })
    await waitFor(() => expect(step()).toBe("type"))
    tapPrimary(continueButton())
    await screen.findByRole("heading", { name: "The basics" })

    tapPrimary(continueButton())
    // Waiting on the check: the page's Back is off...
    await waitFor(() => expect(footerBack().hasAttribute("disabled")).toBe(true))
    // ...but the phone's gesture still goes back.
    act(() => nav.back())
    await screen.findByRole("heading", { name: "What kind of page?" })

    await act(async () => {
      answer.resolve({ username: "kannur_fc", valid: true, available: true })
      await answer.promise
    })

    expect(step()).toBe("type")
    expect(nav.push).not.toHaveBeenCalledWith("/organization/create?step=location")
    expect(continueButton().hasAttribute("disabled")).toBe(false)
  })

  it("a link tapped while the page is being created does nothing and asks nothing", async () => {
    const created = deferred<typeof CREATED>()
    mocks.createOrganizationApi.mockReturnValue(created.promise)
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })
    tapPrimary(createButton())
    await screen.findByRole("button", { name: "Creating your page…" })

    const link = document.createElement("a")
    link.href = "/explore"
    link.textContent = "Explore"
    document.body.appendChild(link)

    // fireEvent returns false when the default was prevented.
    expect(fireEvent.click(link)).toBe(false)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(nav.push).not.toHaveBeenCalledWith("/explore")
  })
})

describe("focus after a server error", () => {
  const LOCATION_ERROR = new CreateOrgError({
    code: "invalid",
    message: "Location: Pick a town we know.",
    field: "location",
    fields: { location: "Pick a town we know." },
  })
  const WITH_TOWN = draftWith({
    ...FULL_DRAFT,
    city: mocks.place as unknown as CreateDraft["city"],
    branchName: "Main branch",
  })

  it("a picked town's error focuses the picker's clear button", async () => {
    mocks.createOrganizationApi.mockRejectedValue(LOCATION_ERROR)
    seedDraft(WITH_TOWN)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    await screen.findByRole("heading", { name: "Location & sports" })
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Clear location" }))
    )
  })

  it("with nothing to focus, the step's heading takes it, and later steps behave", async () => {
    mocks.pickerClearable = false
    mocks.createOrganizationApi.mockRejectedValue(LOCATION_ERROR)
    seedDraft(WITH_TOWN)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    const heading = await screen.findByRole("heading", { name: "Location & sports" })
    await waitFor(() => expect(document.activeElement).toBe(heading))

    // Nothing is left pending: the next step change scrolls up and focuses
    // its heading as usual.
    tapPrimary(continueButton())
    const review = await screen.findByRole("heading", { name: "Review your page" })
    await waitFor(() => expect(document.activeElement).toBe(review))
  })
})

describe("creating, round 2", () => {
  it("a lost answer whose page exists lands on that page, with no second create", async () => {
    mocks.createOrganizationApi.mockRejectedValue(
      new CreateOrgError({ code: "network", message: CREATE_ORG_CONNECTION_MESSAGE })
    )
    mocks.uploadOrgPhoto.mockResolvedValue("https://media.example.com/organizations/org-new/logo.webp?v=1")
    mocks.getMyOrganizationsAsPersonApi.mockResolvedValue([ORG_NEW_LISTED])

    await fillToReview()
    tapPrimary(createButton())

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/organization/admin/org-new/dashboard")
    )
    expect(mocks.createOrganizationApi).toHaveBeenCalledTimes(1)
    // The photos still go to that page, by its id.
    expect(mocks.uploadOrgPhoto.mock.calls.map(([input]) => [input.type, input.orgId])).toEqual([
      ["logo", "org-new"],
      ["cover", "org-new"],
    ])
    expect(useAuthStore.getState().actorId).toBe("org-new")
    expect(storedDraft()).toBeNull()
    const live = mocks.toastShow.mock.calls.map(([options]) => options).find((o) => o.variant === "success")
    expect(live.title).toBe("Kannur FC is live")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("'taken' by one of the person's existing pages stays an error", async () => {
    const existing = { ...ORG_NEW_LISTED, id: "org-old", name: "Kannur FC (old)" }
    useAuthStore.setState({ organizations: [existing] })
    mocks.getMyOrganizationsAsPersonApi.mockResolvedValue([existing])
    mocks.createOrganizationApi.mockRejectedValue(
      new CreateOrgError({ code: "username_taken", message: "Username already taken", field: "username" })
    )
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())

    await waitFor(() => expect(step()).toBe("basics"))
    expect(screen.getByText("That page link was just taken. Pick another one.")).toBeTruthy()
    expect(nav.replace).not.toHaveBeenCalledWith(expect.stringContaining("/organization/admin/"))
    expect(useAuthStore.getState().actorType).toBe("user")
  })

  it("never swaps to the limit state while the page is being created", async () => {
    const created = deferred<typeof CREATED>()
    mocks.createOrganizationApi.mockReturnValue(created.promise)
    mocks.getMyOrganizationsAsPersonApi.mockResolvedValue([ORG_NEW_LISTED])
    seedDraft(FULL_DRAFT)
    renderSetup("/organization/create?step=review")
    await screen.findByRole("heading", { name: "Review your page" })

    tapPrimary(createButton())
    await screen.findByRole("button", { name: "Creating your page…" })

    // A late eligibility answer that already counts this create.
    act(() => {
      client.setQueryData(createEligibilityKey, { allowed: false, limit: 3, used: 3 })
    })
    expect(screen.queryByRole("heading", { name: "You've reached the limit of 3 pages" })).toBeNull()
    expect(screen.getByRole("button", { name: "Creating your page…" })).toBeTruthy()

    await act(async () => {
      created.resolve(CREATED)
      await created.promise
    })
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/organization/admin/org-new/dashboard")
    )
    expect(screen.queryByRole("heading", { name: "You've reached the limit of 3 pages" })).toBeNull()
  })
})
