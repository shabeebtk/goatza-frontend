// @vitest-environment jsdom
/** A host that knows what the report is about opens the sheet ready to send. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ProblemReportSheet from "./ProblemReportSheet"

const submit = vi.hoisted(() => vi.fn())

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}))
vi.mock("@/shared/hooks/useBodyScrollLock", () => ({ useBodyScrollLock: () => undefined }))
vi.mock("@/shared/hooks/useVisualViewport", () => ({ useVisualViewport: () => undefined }))
vi.mock("../../hooks/useSupportQueries", () => ({
  useSubmitProblemReport: () => ({ mutate: submit, isPending: false }),
}))
vi.mock("../../services/clientContext", () => ({ buildClientContext: () => ({}) }))
vi.mock("../../services/screenshotUpload", () => ({
  MAX_SCREENSHOTS: 3,
  uploadScreenshot: vi.fn(),
  validateScreenshot: vi.fn(),
}))

const PREFILL = {
  category: "account_login" as const,
  description: "Please correct my date of birth. It's on file as 12 Mar 2008. ",
}

const field = () => screen.getByRole("textbox") as HTMLTextAreaElement

afterEach(() => {
  cleanup()
  submit.mockClear()
})

describe("ProblemReportSheet with a prefill", () => {
  it("skips the category step and fills the text in", () => {
    render(<ProblemReportSheet prefill={PREFILL} onClose={vi.fn()} />)

    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.getByText("Login or account issue")).toBeTruthy()
    expect(field().value).toBe(PREFILL.description)
  })

  it("leaves the cursor at the end, where the person carries on typing", () => {
    render(<ProblemReportSheet prefill={PREFILL} onClose={vi.fn()} />)

    expect(document.activeElement).toBe(field())
    expect(field().selectionStart).toBe(PREFILL.description.length)
  })

  it("sends what they end up with, under that category", () => {
    render(<ProblemReportSheet prefill={PREFILL} onClose={vi.fn()} />)

    fireEvent.change(field(), {
      target: { value: `${PREFILL.description}The correct date is 12 Mar 2009.` },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(submit.mock.calls[0][0]).toMatchObject({
      category: "account_login",
      description: `${PREFILL.description}The correct date is 12 Mar 2009.`,
    })
  })

  it("opens on the category step without one, as it always has", () => {
    render(<ProblemReportSheet onClose={vi.fn()} />)

    expect(screen.getByRole("radiogroup")).toBeTruthy()
  })
})
