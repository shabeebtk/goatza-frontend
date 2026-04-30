import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationProfilePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <OrgProfile orgId={id} isOwn />
  )
}