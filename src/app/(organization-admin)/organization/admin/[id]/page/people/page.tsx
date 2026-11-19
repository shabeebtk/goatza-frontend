import type { Metadata } from "next"
import PeoplePage from "@/features/orgPage/components/PeoplePage/PeoplePage"

export const metadata: Metadata = {
  title: "Coaches & players · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}

export default async function OrganizationPagePeopleRoute({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab } = await searchParams
  return <PeoplePage orgId={id} tab={tab === "players" ? "players" : "coaches"} />
}
