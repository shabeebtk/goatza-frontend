import type { Metadata } from "next"
import EnquiryDetailPage from "@/features/enquiries/components/EnquiryDetailPage/EnquiryDetailPage"

// The server's enquiry_received notification links to exactly this path:
// /organization/admin/<org_id>/enquiries/<enquiry_id>.
// A generic title: the sender's name never goes into the tab or the history.
export const metadata: Metadata = {
  title: "Enquiry · Goatza",
}

interface PageProps {
  params: Promise<{ id: string; enquiryId: string }>
}

export default async function OrganizationEnquiryRoute({ params }: PageProps) {
  const { id, enquiryId } = await params
  return <EnquiryDetailPage orgId={id} enquiryId={enquiryId} />
}
