// ─────────────────────────────────────────────────────────────
// Match diary — the signed-in player's own log
// ─────────────────────────────────────────────────────────────

import MatchDiaryPage from "@/features/matchDiary/components/MatchDiaryPage/MatchDiaryPage"
import PlayersOnly from "@/features/matchDiary/components/PlayersOnly/PlayersOnly"

export default function MatchDiaryRoute() {
    return (
        <PlayersOnly>
            <MatchDiaryPage />
        </PlayersOnly>
    )
}
