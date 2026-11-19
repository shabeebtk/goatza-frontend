"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

import type { PageShowcase } from "@/features/orgPage/types"
import EnquirySheet, { type EnquirySheetOrg } from "./components/EnquirySheet/EnquirySheet"

/**
 * How anything on an org's public page asks for the enquiry form: a program
 * card's "Enquire", the contact buttons in the header, the phone's sticky bar
 * and the desktop aside. The provider wraps the profile and holds the sheet:
 * whether it is open, and the program it was opened for.
 */

export type EnquiryOpenOptions = {
  /** The program the visitor tapped "Enquire" on, preselected in the form. */
  programId?: string
}

type EnquiryContextValue = {
  open: (options?: EnquiryOpenOptions) => void
  /** The sheet is up: the phone's Enquire bar steps out of its way. */
  isOpen: boolean
}

const NOOP: EnquiryContextValue = { open: () => {}, isOpen: false }

const EnquiryContext = createContext<EnquiryContextValue>(NOOP)

/** `?enquire=1` (with `&program=<id>`): the link a club shares to open the form. */
export const ENQUIRE_PARAM = "enquire"
export const PROGRAM_PARAM = "program"

export type { EnquirySheetOrg }

type SheetState = { programId: string } | null

/**
 * Wraps the org's profile. With the page's enquiry form on (and not on the
 * org's own admin profile, `disabled`), `open` brings up the sheet; otherwise
 * it does nothing, so a stray call can never show a form the club turned off.
 */
export function EnquiryProvider({
  page,
  org,
  anonymous,
  disabled = false,
  children,
}: {
  page: PageShowcase | null
  org: EnquirySheetOrg
  /** Logged out: the form posts without an account. */
  anonymous: boolean
  disabled?: boolean
  children: ReactNode
}) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const available = Boolean(page?.contact?.enquiry_form) && !disabled
  const programs = page?.programs ?? []

  const open = (options?: EnquiryOpenOptions) => {
    if (!available) return
    const programId = programs.some((program) => program.id === options?.programId) ? options!.programId! : ""
    setSheet({ programId })
  }

  // The deep link opens the sheet once, after the page has answered with the
  // form on, and then leaves the URL so a refresh doesn't open it again. Read
  // from window like the profile's ?edit=: the public profile renders this too,
  // and useSearchParams would need its own Suspense boundary there.
  const router = useRouter()
  const pathname = usePathname()
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (!available || deepLinkDone.current || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get(ENQUIRE_PARAM) !== "1") return
    deepLinkDone.current = true

    const wanted = params.get(PROGRAM_PARAM) ?? ""
    const known = (page?.programs ?? []).some((program) => program.id === wanted)
    // The URL is read once, after the page has loaded: nothing to derive in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet({ programId: known ? wanted : "" })

    params.delete(ENQUIRE_PARAM)
    params.delete(PROGRAM_PARAM)
    const rest = params.toString()
    const path = pathname ?? window.location.pathname
    router.replace(rest ? `${path}?${rest}` : path, { scroll: false })
  }, [available, page, pathname, router])

  const value: EnquiryContextValue = { open, isOpen: sheet !== null }

  return (
    <EnquiryContext.Provider value={value}>
      {children}
      {sheet && page && available && (
        <EnquirySheet
          org={org}
          page={page}
          anonymous={anonymous}
          initialProgramId={sheet.programId}
          onClose={() => setSheet(null)}
        />
      )}
    </EnquiryContext.Provider>
  )
}

/** Outside a provider, `open` is a no-op rather than a crash. */
export function useEnquiry(): EnquiryContextValue {
  return useContext(EnquiryContext)
}
