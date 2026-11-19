// @vitest-environment jsdom
/**
 * The two page reads: the one 404 is an answer (null), not an error, and the
 * anonymous read uses the server's seed without asking again.
 */

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE } from "../__fixtures__/pageShowcase"
import { usePageShowcase, usePublicPageShowcase } from "./usePageShowcase"

const mocks = vi.hoisted(() => ({ signed: vi.fn(), anonymous: vi.fn() }))
vi.mock("../services/pageShowcase.api", () => ({
  getPageShowcaseApi: mocks.signed,
  fetchPublicPageShowcase: mocks.anonymous,
}))

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mocks.signed.mockReset()
  mocks.anonymous.mockReset()
})

describe("usePageShowcase (signed in)", () => {
  it("answers the 404 with null", async () => {
    mocks.signed.mockRejectedValue({ response: { status: 404 } })

    const { result } = renderHook(() => usePageShowcase("kannurfa"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it("keeps any other failure an error", async () => {
    mocks.signed.mockRejectedValue({ response: { status: 500 } })

    const { result } = renderHook(() => usePageShowcase("kannurfa"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it("returns the page", async () => {
    mocks.signed.mockResolvedValue(ACADEMY_PAGE)

    const { result } = renderHook(() => usePageShowcase("kannurfa"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toEqual(ACADEMY_PAGE))
  })
})

describe("usePublicPageShowcase (anonymous)", () => {
  it("answers not_found with null", async () => {
    mocks.anonymous.mockResolvedValue({ status: "not_found" })

    const { result } = renderHook(() => usePublicPageShowcase("kannurfa"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it("uses the server's seed without a fetch", () => {
    const { result } = renderHook(() => usePublicPageShowcase("kannurfa", true, ACADEMY_PAGE), {
      wrapper: wrapper(),
    })

    expect(result.current.data).toBe(ACADEMY_PAGE)
    expect(mocks.anonymous).not.toHaveBeenCalled()
  })

  it("takes a null seed as the answer too, so the profile is as it was without asking", () => {
    const { result } = renderHook(() => usePublicPageShowcase("kannurfa", true, null), { wrapper: wrapper() })

    expect(result.current.data).toBeNull()
    expect(mocks.anonymous).not.toHaveBeenCalled()
  })
})
