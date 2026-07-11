import { Suspense } from "react"
import PlayersListPage from "@/features/explore/components/PlayersListPage/PlayersListPage"

// PlayersListPage reads useSearchParams → needs a Suspense boundary.
export default function ExplorePlayersPage() {
  return (
    <Suspense fallback={null}>
      <PlayersListPage />
    </Suspense>
  )
}
