/**
 * W, D or L in a square — a match's result at a glance, on the diary card and on
 * the profile's recent rows. The letter carries it as well as the colour, so it
 * still reads for somebody who cannot tell the tints apart.
 */

import { MATCH_RESULT_LABELS, resultTone } from "../../matchDiaryMeta"
import type { MatchResult } from "../../types"
import styles from "./MatchResultBadge.module.css"

const RESULT_LETTERS: Record<MatchResult, string> = {
    win: "W",
    draw: "D",
    loss: "L",
    na: "–",
}

export default function MatchResultBadge({
    result,
    size = "md",
}: {
    result: MatchResult
    size?: "sm" | "md"
}) {
    return (
        <span
            className={`${styles.badge} ${size === "sm" ? styles.sm : ""}`}
            data-tone={resultTone(result)}
            role="img"
            aria-label={MATCH_RESULT_LABELS[result] || "No result"}
        >
            {RESULT_LETTERS[result]}
        </span>
    )
}
