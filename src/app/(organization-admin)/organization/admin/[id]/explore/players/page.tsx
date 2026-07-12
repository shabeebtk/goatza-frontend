import { Suspense } from "react"
import PlayersListPage from "@/features/explore/components/PlayersListPage/PlayersListPage"

// PlayersListPage reads useSearchParams → needs a Suspense boundary.
export default function OrganizationExplorePlayersPage() {
  return (
    <Suspense fallback={null}>
      <PlayersListPage />
    </Suspense>
  )
}
