/**
 * Match diary — display copy and the small formatting rules.
 *
 * Kept out of `types.ts` (which mirrors the API) and out of the components, so
 * the diary list, the summary block and the Stage 6 form all print the same
 * words for the same enum value.
 *
 * No colours here, ever. `resultTone` returns a semantic tone name and the CSS
 * module decides what that looks like — a hex in this file would be a colour
 * that cannot follow the theme into dark mode.
 */

import type {
    MatchEntry,
    MatchEntryStat,
    MatchResult,
    MatchStatus,
    MatchType,
    StatValueType,
} from "./types"

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
    league: "League",
    tournament: "Tournament",
    friendly: "Friendly",
    school_college: "School / College",
    practice: "Practice",
    other: "Other",
}

/**
 * `na` is an EMPTY STRING on purpose.
 *
 * "Not applicable" is a database value, not something to print on a match card.
 * A friendly nobody kept score in has no result, and the right rendering of
 * that is no chip at all — callers check for the empty string and skip.
 */
export const MATCH_RESULT_LABELS: Record<MatchResult, string> = {
    win: "Won",
    loss: "Lost",
    draw: "Drawn",
    na: "",
}

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
    scheduled: "Scheduled",
    played: "Played",
}

/** The tones a result chip can take. The CSS module maps each to a token. */
export type ResultTone = "win" | "loss" | "draw" | "neutral"

/**
 * The semantic tone for a result.
 *
 * Deliberately a name and not a colour: this same function feeds the diary row,
 * the summary block and (later) the showcased profile card, and all three have
 * to keep agreeing across light and dark mode. Only the CSS knows the values.
 */
export const resultTone = (result: MatchResult): ResultTone =>
    result === "na" ? "neutral" : result

/**
 * A stat value as it should read.
 *
 * Everything arrives as a decimal because every stat shares one column, so an
 * integer stat has to be trimmed back here — "2 goals", never "2.00 goals".
 * A decimal stat keeps its meaningful digits and loses the trailing zeros, so
 * 10.50 reads as "10.5" and 10.00 as "10".
 */
export const formatStatValue = (
    value: number,
    valueType: StatValueType
): string => {
    if (!Number.isFinite(value)) return "—"
    if (valueType === "integer") return String(Math.round(value))
    // Two decimals is the column's precision; parseFloat drops trailing zeros.
    return String(parseFloat(value.toFixed(2)))
}

/**
 * The ONE stat a collapsed diary row shows.
 *
 * A row that printed all twelve would be unreadable on a phone and would bury
 * the one number the player actually wants to see. The catalog already says
 * which those are — `is_primary` marks the three the quick-add form leads with
 * — so the first primary stat the player logged wins. Falling back to the first
 * logged stat means a row is never blank just because someone logged only
 * tackles.
 *
 * Returns the rendered string ("2G", "10.5km") or null when nothing was logged.
 */
export const headlineStat = (entry: MatchEntry): string | null => {
    if (entry.stats.length === 0) return null

    const chosen: MatchEntryStat =
        entry.stats.find((stat) => stat.is_primary) ?? entry.stats[0]

    const value = formatStatValue(chosen.value, chosen.value_type)
    const label = chosen.unit || chosen.short_label || chosen.name

    return `${value}${label}`
}

/**
 * Integer ball count → cricket overs notation. 27 becomes "4.3".
 *
 * This is the display half of a decision made in the backend seed
 * (`matches/management/commands/seed_match_stat_fields.py`): the catalog stores
 * "Balls bowled", not overs, because overs notation is not a decimal. 4.3 means
 * four overs and three balls, so summing overs as decimals produces wrong
 * season totals — 4.3 + 4.3 would come out as 8.6 rather than 9.0. The integer
 * ball count is the one number that adds up; this turns it back into the
 * notation a cricketer reads.
 */
export const formatOvers = (balls: number): string => {
    if (!Number.isFinite(balls) || balls < 0) return "0"
    const whole = Math.floor(balls / 6)
    const remainder = Math.floor(balls % 6)
    return remainder === 0 ? String(whole) : `${whole}.${remainder}`
}

/**
 * The catalog name of cricket's ball count, matched case-insensitively.
 *
 * This is the ONE place in the frontend that knows a sport-specific stat by
 * name, and it is here rather than in a component for that reason: the seed
 * command chose to store balls and the display rule that undoes it belongs
 * beside `formatOvers`, not scattered across whichever screens have room to
 * apply it. Nothing breaks if an admin renames the field — the stat simply
 * reads as a ball count again, which is what the column actually holds.
 */
const BALLS_BOWLED_STAT = "balls bowled"

/**
 * A stat as the DETAIL modal shows it — value, its unit, and the label above.
 *
 * Separate from what a diary card renders, and deliberately so. A card tile is
 * 64px of width under a truncated label, so it prints the number the column
 * holds ("27" under "Balls bowled") and stays honest. The modal has room to
 * name the notation a cricketer actually reads, so 27 balls becomes "4.3" under
 * "Overs" — see `formatOvers` for why the two are not the same number.
 */
export const statDetail = (
    stat: MatchEntryStat
): { value: string; unit: string; label: string } =>
    stat.name.trim().toLowerCase() === BALLS_BOWLED_STAT
        ? { value: formatOvers(stat.value), unit: "", label: "Overs" }
        : {
            value: formatStatValue(stat.value, stat.value_type),
            unit: stat.unit,
            label: stat.name,
        }

/**
 * "You played Riverside FC" vs "You played a match" — an opponent is optional
 * and a sentence with a hole in it reads worse than one without the name.
 */
export const opponentLabel = (opponentName: string): string =>
    opponentName.trim() || "a match"
