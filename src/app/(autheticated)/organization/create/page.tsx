import { Suspense } from "react"
import type { Metadata } from "next"
import OrganizationSetup from "@/features/organization/component/OrganizationSetup/OrganizationSetup"

export const metadata: Metadata = {
  title: "Create a page · Goatza",
}

// The step lives in the URL (?step=), read with useSearchParams, which needs a
// Suspense boundary or the route bails out of static rendering at build time.
export default function OrganizationSetupPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationSetup />
    </Suspense>
  )
}
