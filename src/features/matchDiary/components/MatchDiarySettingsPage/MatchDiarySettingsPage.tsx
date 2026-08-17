"use client"

/**
 * Settings → Match diary.
 *
 * One toggle, built from the same SettingsSection / SettingsToggleRow pieces as
 * the account menu and the Sports CV screen, so it looks like every other
 * switch in the app rather than like a screen somebody wrote later.
 *
 * ── What the helper text has to carry ─────────────────────────
 *
 * This switch publishes something. The player's totals, their streak and their
 * win/loss record become readable by anyone who can see their profile — and,
 * just as importantly, their individual matches do NOT. Notes, photos, ratings
 * and opponents stay private whichever way this sits, because the endpoint
 * behind the profile card only ever returns aggregates.
 *
 * Both halves are said in one sentence under the switch, before it is flipped.
 * A player deciding whether to publish a season needs to know what "a season"
 * means here, and finding out afterwards is not a choice.
 *
 * ── Deliberately NOT gated on the profile being public ────────
 *
 * Unlike the Sports CV, which is read by logged-out visitors and so requires
 * `is_public_profile`, this surface is in-app and authenticated
 * (`get_showcase_user` says so out loud). A player with a private profile still
 * has teammates and coaches inside Goatza, and the summary is for them — so
 * there is no dependency notice on this screen and nothing to explain away.
 *
 * ── 403 ───────────────────────────────────────────────────────
 *
 * Only players have a diary. A coach or scout reaching this URL gets the
 * server's own sentence, which names their role, rather than a generic failure
 * — same treatment CVSettingsPage gives the same situation.
 */

import { Icon } from "@iconify/react"

import { BackHeader } from "@/shared/components/ui"
import {
    SettingsSection,
    SettingsToggleRow,
} from "@/features/settings/components/SettingsMenu/SettingsMenu"

import {
    useMatchDiarySettings,
    useUpdateMatchDiarySettings,
} from "../../hooks/useMatchDiary"
import {
    getMatchDiaryErrorMessage,
    isMatchDiaryForbidden,
} from "../../services/matches.api"
import styles from "./MatchDiarySettingsPage.module.css"

export default function MatchDiarySettingsPage() {
    // Enabled: this GET get-or-creates the settings row server-side, which is
    // exactly right for a screen the owner opened on purpose.
    const { data: settings, isPending, error } = useMatchDiarySettings()
    const update = useUpdateMatchDiarySettings()

    if (error) {
        return (
            <div className={styles.page}>
                <BackHeader title="Match diary" fallback="/settings" />
                <div className={styles.state}>
                    <Icon icon="mdi:alert-circle-outline" width={28} height={28} />
                    <p className={styles.stateText}>
                        {isMatchDiaryForbidden(error)
                            ? getMatchDiaryErrorMessage(
                                error,
                                "Only players have a match diary."
                            )
                            : "Couldn't load your match diary settings."}
                    </p>
                </div>
            </div>
        )
    }

    // Off while the first fetch is in flight, which is also the model default —
    // so the switch never flicks from on to off in front of the owner.
    const showcase = settings?.showcase_summary ?? false

    return (
        <div className={styles.page}>
            <BackHeader title="Match diary" fallback="/settings" />

            <p className={styles.intro}>
                Log the matches you play — result, minutes, the stats that
                matter for your sport — and the diary keeps the running totals.
            </p>

            <SettingsSection title="On your profile">
                <SettingsToggleRow
                    icon="mdi:chart-box-outline"
                    label="Show my season summary on my profile"
                    // The whole trade, in one sentence: what goes out, and what
                    // never does.
                    description="Your totals, record and streak become visible to anyone who can see your profile. Individual matches, notes and photos stay private either way."
                    checked={showcase}
                    busy={update.isPending}
                    onChange={(next) =>
                        update.mutate({ showcase_summary: next })
                    }
                />
            </SettingsSection>

            {!isPending && (settings?.longest_streak_weeks ?? 0) > 0 && (
                <p className={styles.streakNote}>
                    Your longest run is {settings?.longest_streak_weeks}{" "}
                    {settings?.longest_streak_weeks === 1 ? "week" : "weeks"} of
                    matches in a row.
                </p>
            )}
        </div>
    )
}
