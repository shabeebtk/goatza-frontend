import { Suspense } from "react"
import SearchPage from "@/features/search/components/SearchPage/SearchPage"

// Org-side search — same component as the user side. Rendered under the
// /organization/admin/[id] route space so the active actor stays the org and
// every link (see-all, profiles, posts) resolves via useNavigation in-context.
// SearchPage reads useSearchParams (hydrates `?q=`) → needs a Suspense boundary.
export default function OrganizationSearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  )
}
