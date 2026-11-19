import type { Metadata } from "next"
import EnquiriesInboxPage from "@/features/enquiries/components/EnquiriesInboxPage/EnquiriesInboxPage"
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/features/enquiries/types"

export const metadata: Metadata = {
  title: "Enquiries · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string | string[] }>
}

export default async function OrganizationEnquiriesRoute({ params, searchParams }: PageProps) {
  const { id } = await params
  const { status } = await searchParams
  const tab = ENQUIRY_STATUSES.find((value) => value === status) ?? ("new" as EnquiryStatus)
  return <EnquiriesInboxPage orgId={id} status={tab} />
}
