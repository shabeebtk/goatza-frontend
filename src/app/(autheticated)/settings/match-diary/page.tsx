// ─────────────────────────────────────────────────────────────
// Settings → Match diary (the signed-in player's showcase toggle)
// ─────────────────────────────────────────────────────────────

import PlayersOnly from "@/features/matchDiary/components/PlayersOnly/PlayersOnly"
import MatchDiarySettingsPage from "@/features/matchDiary/components/MatchDiarySettingsPage/MatchDiarySettingsPage"

export default function MatchDiarySettingsRoute() {
    return (
        <PlayersOnly>
            <MatchDiarySettingsPage />
        </PlayersOnly>
    )
}
