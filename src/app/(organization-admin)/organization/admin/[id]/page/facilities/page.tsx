import type { Metadata } from "next"
import FacilitiesPage from "@/features/orgPage/components/FacilitiesPage/FacilitiesPage"

export const metadata: Metadata = {
  title: "Facilities · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ location?: string | string[] }>
}

export default async function OrganizationPageFacilitiesRoute({ params, searchParams }: PageProps) {
  const { id } = await params
  const { location } = await searchParams
  return <FacilitiesPage orgId={id} locationId={typeof location === "string" ? location : undefined} />
}
