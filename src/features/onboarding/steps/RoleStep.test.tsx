// @vitest-environment jsdom
/**
 * Google's age step: asked here because the OAuth flow asked nothing, and it gets
 * the same warning as the signup form, because it is just as final.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import RoleStep from "./RoleStep"

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("@/features/auth/components/RoleSelect/RoleSelect", () => ({ default: () => null }))
vi.mock("@/features/auth/hooks/useAuthMutations", () => ({
  useSetRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/shared/components/CountrySelect", () => ({
  default: () => null,
  defaultCountryCode: () => "IN",
}))

const WARNING =
  "Check this carefully — you won't be able to change your date of birth later."

beforeEach(() => {
  useAuthStore.setState({ user: null } as never)
})

afterEach(cleanup)

describe("RoleStep's date of birth", () => {
  it("warns under the field when it asks", () => {
    useAuthStore.setState({
      user: { id: "u1", country_code: "", is_role_confirmed: false },
    } as never)

    render(<RoleStep onNext={vi.fn()} />)

    expect(screen.getByLabelText("Year")).toBeTruthy()
    expect(screen.getByText(WARNING)).toBeTruthy()
  })

  it("says nothing to somebody it does not ask", () => {
    useAuthStore.setState({
      user: { id: "u1", country_code: "IN", is_role_confirmed: true },
    } as never)

    render(<RoleStep onNext={vi.fn()} />)

    expect(screen.queryByText(WARNING)).toBeNull()
  })
})
