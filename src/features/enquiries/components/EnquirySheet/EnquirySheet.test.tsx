// @vitest-environment jsdom
/**
 * The enquiry form: its fields for a child or for oneself, the under-18 rule,
 * the honeypot, the checks and the server's answers, focus in and out, the
 * discard question, and "Enquiry sent".
 */

import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE, LOCATIONS } from "@/features/orgPage/__fixtures__/pageShowcase"
import type { PageShowcase } from "@/features/orgPage/types"
import { useAuthStore } from "@/store/auth.store"
import type { EnquirySubmitOutcome } from "../../types"
import EnquirySheet, { type EnquirySheetOrg } from "./EnquirySheet"

const mocks = vi.hoisted(() => ({ submit: vi.fn(), follow: vi.fn() }))

vi.mock("../../services/enquirySubmit.api", () => ({ submitEnquiry: mocks.submit }))
vi.mock("@/features/organization/hooks/useOrganizations", () => ({
  useFollowOrg: () => ({ follow: { mutate: mocks.follow, isPending: false } }),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/profile/kannurfa",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const ORG: EnquirySheetOrg = {
  id: "org-1",
  username: "kannurfa",
  name: "Kannur FA",
  logo: "",
  type: "academy",
  locations: LOCATIONS,
  isFollowing: false,
}

const SENT: EnquirySubmitOutcome = {
  kind: "sent",
  enquiry: { program_name: "U12 Football Foundation", location_name: "Main Ground", phone_masked: "+91 98•••• 3210" },
}

/** A page with the sheet behind an "Open" button, so focus has somewhere to go back to. */
function Harness({
  org = ORG,
  page = ACADEMY_PAGE,
  anonymous = true,
  programId = "",
  onClose = () => {},
}: {
  org?: EnquirySheetOrg
  page?: PageShowcase
  anonymous?: boolean
  programId?: string
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <EnquirySheet
          org={org}
          page={page}
          anonymous={anonymous}
          initialProgramId={programId}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

const openSheet = (props: Parameters<typeof Harness>[0] = {}) => {
  const view = render(<Harness {...props} />)
  const opener = screen.getByRole("button", { name: "Open" })
  opener.focus()
  fireEvent.click(opener)
  return { ...view, opener, sheet: screen.getByRole("dialog", { name: "Enquire" }) }
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

const fillChild = () => {
  type("Child's name", "Aditya Menon")
  type("Child's age", "11")
  type("Your name (parent or guardian)", "Meera Menon")
  type("Phone number", "98765 43210")
}

const send = () => fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }))

beforeEach(() => {
  mocks.submit.mockReset()
  mocks.follow.mockReset()
  useAuthStore.setState({ user: null } as never)
})

afterEach(cleanup)

describe("the fields", () => {
  it("asks for the child, then the parent, for My child (the default)", () => {
    openSheet()

    expect(screen.getByRole("radio", { name: "My child" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByLabelText("Child's name")).toBeTruthy()
    expect(screen.getByLabelText("Child's age").getAttribute("inputmode")).toBe("numeric")
    expect(screen.getByLabelText("Your name (parent or guardian)")).toBeTruthy()
    expect(screen.queryByLabelText("Your age")).toBeNull()
  })

  it("asks for the visitor's own name and age for Me", () => {
    openSheet()
    fireEvent.click(screen.getByRole("radio", { name: "Me" }))

    expect(screen.getByLabelText("Your name")).toBeTruthy()
    expect(screen.getByLabelText("Your age")).toBeTruthy()
    expect(screen.queryByLabelText("Child's name")).toBeNull()
  })

  it("has the phone field, the WhatsApp box ticked, the branch with two branches, and a counter", () => {
    openSheet()

    const phone = screen.getByLabelText("Phone number")
    expect(phone.getAttribute("type")).toBe("tel")
    expect(phone.getAttribute("autocomplete")).toBe("tel")
    expect(phone.getAttribute("placeholder")).toBe("98765 43210")
    expect(screen.getByText("Only Kannur FA sees it.")).toBeTruthy()
    expect((screen.getByLabelText("This number is on WhatsApp") as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole("combobox", { name: "Branch (optional)" })).toBeTruthy()
    expect(screen.getByText("0/500")).toBeTruthy()
  })

  it("prefills the branch of the program it was opened for", () => {
    openSheet({ programId: "prog-1" })

    expect(screen.getByRole("combobox", { name: "Program (optional)" }).textContent).toContain(
      "U12 Football Foundation · Ages 8 – 12"
    )
    expect(screen.getByRole("combobox", { name: "Branch (optional)" }).textContent).toContain("Main Ground")
  })

  it("prefills only Your name for a signed-in visitor", () => {
    useAuthStore.setState({ user: { id: "u-1", username: "meera", name: "Meera Menon" } } as never)
    openSheet({ anonymous: false })

    expect((screen.getByLabelText("Your name (parent or guardian)") as HTMLInputElement).value).toBe("Meera Menon")
    expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("")
  })

  it("makes a best time a single choice that a second tap clears", () => {
    openSheet()
    const evening = screen.getByRole("button", { name: "Evening" })

    fireEvent.click(evening)
    expect(evening.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Morning" }))
    expect(evening.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "Morning" }))
    expect(screen.getByRole("button", { name: "Morning" }).getAttribute("aria-pressed")).toBe("false")
  })
})

describe("the under-18 rule", () => {
  it("blocks sending for Me under 18, and Switch to My child moves the name", () => {
    openSheet()
    fireEvent.click(screen.getByRole("radio", { name: "Me" }))
    type("Your name", "Rahul Das")
    type("Your age", "15")

    expect(screen.getByText("If you're under 18, ask a parent or guardian to send this for you.")).toBeTruthy()
    const sendButton = screen.getByRole("button", { name: "Send enquiry" }) as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Switch to My child" }))

    expect(screen.getByRole("radio", { name: "My child" }).getAttribute("aria-checked")).toBe("true")
    expect((screen.getByLabelText("Child's name") as HTMLInputElement).value).toBe("Rahul Das")
    expect((screen.getByLabelText("Child's age") as HTMLInputElement).value).toBe("15")
    expect((screen.getByRole("button", { name: "Send enquiry" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("sending", () => {
  it("has a hidden honeypot named website, and sends what it holds", async () => {
    mocks.submit.mockResolvedValue(SENT)
    const { sheet } = openSheet()

    const honeypot = sheet.querySelector('input[name="website"]') as HTMLInputElement
    expect(honeypot.tabIndex).toBe(-1)
    expect(honeypot.getAttribute("autocomplete")).toBe("off")
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull()

    fillChild()
    fireEvent.change(honeypot, { target: { value: "http://spam.example" } })
    send()

    await waitFor(() => expect(mocks.submit).toHaveBeenCalled())
    const [username, body, transport] = mocks.submit.mock.calls[0]
    expect(username).toBe("kannurfa")
    expect(body.website).toBe("http://spam.example")
    expect(body.for_whom).toBe("child")
    expect(transport).toEqual({ anonymous: true })
  })

  it("sends signed in as the person", async () => {
    mocks.submit.mockResolvedValue(SENT)
    openSheet({ anonymous: false })
    fillChild()
    send()

    await waitFor(() => expect(mocks.submit).toHaveBeenCalled())
    expect(mocks.submit.mock.calls[0][2]).toEqual({ anonymous: false })
  })

  it("shows a check's error under its field and focuses the first one", async () => {
    openSheet()
    type("Child's age", "11")
    send()

    const name = screen.getByLabelText("Child's name")
    await waitFor(() => expect(document.activeElement).toBe(name))
    // Under the field, linked to it, and said once in the sheet's live region.
    const [underField, announced] = screen.getAllByText("Enter your child's name.")
    expect(name.getAttribute("aria-describedby")).toContain(underField.closest("p")!.id)
    expect(announced.closest("[aria-live]")).not.toBeNull()
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("is refused offline before anything is sent", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    openSheet()
    fillChild()
    send()

    expect(await screen.findByText("You're offline. Check your connection and try again.")).toBeTruthy()
    expect(mocks.submit).not.toHaveBeenCalled()
    online.mockRestore()
  })

  it("switches to My child when the server asks for a guardian", async () => {
    const sentence = "If you're under 18, ask a parent or guardian to send this for you."
    mocks.submit.mockResolvedValue({ kind: "guardian_needed", message: sentence })
    openSheet()
    fireEvent.click(screen.getByRole("radio", { name: "Me" }))
    type("Your name", "Rahul Das")
    type("Your age", "19")
    type("Phone number", "98765 43210")
    send()

    expect(await screen.findByText(sentence)).toBeTruthy()
    expect(screen.getByRole("radio", { name: "My child" }).getAttribute("aria-checked")).toBe("true")
    expect((screen.getByLabelText("Child's name") as HTMLInputElement).value).toBe("Rahul Das")
  })

  it("announces too many enquiries in a banner and keeps the button", async () => {
    mocks.submit.mockResolvedValue({
      kind: "too_many",
      message: "You've already sent a few enquiries today. They'll be in touch.",
    })
    openSheet()
    fillChild()
    send()

    const banner = await screen.findByRole("alert")
    await waitFor(() =>
      expect(banner.textContent).toBe("You've already sent a few enquiries today. They'll be in touch.")
    )
    expect(screen.getByRole("button", { name: "Send enquiry" })).toBeTruthy()
  })

  it("puts the server's field errors under their fields", async () => {
    mocks.submit.mockResolvedValue({ kind: "invalid", errors: { phone: "Enter a valid mobile number." }, message: "" })
    openSheet()
    fillChild()
    send()

    expect(await screen.findAllByText("Enter a valid mobile number.")).toHaveLength(2)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Phone number")))
  })

  it("replaces the form with the closed state on a 404", async () => {
    mocks.submit.mockResolvedValue({ kind: "closed" })
    openSheet()
    fillChild()
    send()

    expect(await screen.findByText("This page isn't taking enquiries right now.")).toBeTruthy()
    expect(screen.queryByLabelText("Child's name")).toBeNull()
    // The header's X and the state's own Close.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2)
  })

  it("says what a throttle and a lost connection mean, and keeps what was typed", async () => {
    mocks.submit.mockResolvedValueOnce({ kind: "throttled", retryAfter: 1800 })
    openSheet()
    fillChild()
    send()
    expect(await screen.findByText("Too many attempts from this network. Try again in an hour.")).toBeTruthy()

    mocks.submit.mockResolvedValueOnce({ kind: "network" })
    send()
    expect(await screen.findByText("Couldn't send your enquiry. Check your connection and try again.")).toBeTruthy()
    expect((screen.getByLabelText("Child's name") as HTMLInputElement).value).toBe("Aditya Menon")
  })
})

describe("focus and closing", () => {
  it("lands on the first field, and goes back to the button that opened it", async () => {
    const onClose = vi.fn()
    const { opener } = openSheet({ onClose })

    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "My child" }))

    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(document.activeElement).toBe(opener)
  })

  it("asks before throwing away anything typed", async () => {
    const onClose = vi.fn()
    openSheet({ onClose })
    type("Child's name", "Aditya")

    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText("Discard this enquiry?")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(within(confirm).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("closes without asking when nothing was typed", async () => {
    const onClose = vi.fn()
    openSheet({ onClose })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})

describe("Enquiry sent", () => {
  const sendChild = async (props: Parameters<typeof Harness>[0] = {}) => {
    mocks.submit.mockResolvedValue(SENT)
    openSheet(props)
    fillChild()
    fireEvent.click(screen.getByRole("button", { name: "Evening" }))
    send()
    return screen.findByRole("heading", { name: "Enquiry sent", level: 3 })
  }

  it("says who will call on the masked number, and what was asked", async () => {
    await sendChild()

    expect(screen.getByText("+91 98•••• 3210").closest("p")!.textContent).toBe(
      "Kannur FA will contact you on +91 98•••• 3210."
    )
    expect(screen.getByText("Aditya, 11 · U12 Football Foundation")).toBeTruthy()
    expect(screen.getByText("Main Ground · Best time: Evening")).toBeTruthy()
    expect(screen.queryByLabelText("Child's name")).toBeNull()
  })

  it("offers WhatsApp only while the club has it on", async () => {
    await sendChild()
    const whatsapp = screen.getByRole("link", { name: "Message Kannur FA on WhatsApp" })
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain(
      "Hi Kannur FA, I just sent an enquiry on Goatza about Aditya."
    )

    cleanup()
    await sendChild({ page: { ...ACADEMY_PAGE, contact: { ...ACADEMY_PAGE.contact, whatsapp: null } } })
    expect(screen.queryByRole("link", { name: /on WhatsApp/ })).toBeNull()
  })

  it("asks an anonymous visitor to sign up to follow", async () => {
    await sendChild()

    const follow = screen.getByRole("link", { name: "Follow the academy on Goatza" })
    expect(follow.getAttribute("href")).toBe(
      `/auth?mode=signup&next=${encodeURIComponent("/organization/profile/kannurfa")}`
    )
  })

  it("offers Follow to a signed-in visitor who doesn't follow yet, and nothing to one who does", async () => {
    await sendChild({ anonymous: false })
    fireEvent.click(screen.getByRole("button", { name: "Follow Kannur FA" }))
    expect(mocks.follow).toHaveBeenCalled()
    expect(screen.getByText("You're following Kannur FA")).toBeTruthy()

    cleanup()
    await sendChild({ anonymous: false, org: { ...ORG, isFollowing: true } })
    expect(screen.queryByRole("button", { name: /Follow/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /Follow/ })).toBeNull()
  })

  it("closes on Back to the academy", async () => {
    const onClose = vi.fn()
    await sendChild({ onClose })

    fireEvent.click(screen.getByRole("button", { name: "Back to the academy" }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
