import { Suspense } from "react"
import SearchPage from "@/features/search/components/SearchPage/SearchPage"

// SearchPage reads useSearchParams (hydrates `?q=` for back-navigation) → it
// needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  )
}
