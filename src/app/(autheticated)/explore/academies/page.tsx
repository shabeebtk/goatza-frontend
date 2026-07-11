import { Suspense } from "react"
import OrgsListPage from "@/features/explore/components/OrgsListPage/OrgsListPage"

// Academies only, matching the "Academies" rail. (The backend `school` org type
// is omitted here too, same as the rails.)
// OrgsListPage reads useSearchParams → needs a Suspense boundary.
export default function ExploreAcademiesPage() {
  return (
    <Suspense fallback={null}>
      <OrgsListPage types="academy" title="Academies" />
    </Suspense>
  )
}
