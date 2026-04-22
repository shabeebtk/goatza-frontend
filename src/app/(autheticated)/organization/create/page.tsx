import OrganizationSetup from "@/features/organization/component/OrganizationSetup/OrganizationSetup"
import type { Metadata } from "next"
 
export const metadata: Metadata = {
  title: "Create a Page · Goatza",
}
 
export default function OrganizationSetupPage() {
  return <OrganizationSetup />
}