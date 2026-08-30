"use client"

/**
 * PoweredByGoogle — the attribution that must be visible wherever Places
 * predictions are shown.
 *
 * This is a legal requirement, not decoration: Goatza renders Google Places
 * results WITHOUT a Google map, and Google's Places policies require the
 * "Powered by Google" mark in that case (docs/PLACES_MIGRATION.md section 3
 * rule 6). It belongs directly under the results list, in every picker.
 *
 * ── Why an onError fallback ───────────────────────────────────
 *
 * The official light/dark PNGs belong at `public/google/`. They are NOT in the
 * repo yet, so this renders a plain-text mark today and silently upgrades to
 * the real logo the moment the files are dropped in — no code change, no flag
 * to remember to flip. A missing image would otherwise render as a broken-image
 * icon where an attribution is legally required, which is worse than text.
 *
 * ── Why two <img> tags ────────────────────────────────────────
 *
 * The app has no JS theme store — light/dark is CSS `prefers-color-scheme`
 * throughout — and `src` cannot be set from CSS. So both variants render and
 * the stylesheet hides the wrong one. Only one is ever visible.
 *
 * Plain <img>, not next/image: these are tiny fixed-size static assets, and
 * next/image would need them added to `images.remotePatterns` reasoning it does
 * not need for a local file.
 */

import { useState } from "react"
import styles from "./PoweredByGoogle.module.css"

const ON_WHITE = "/google/powered_by_google_on_white.png"
const ON_NON_WHITE = "/google/powered_by_google_on_non_white.png"

interface PoweredByGoogleProps {
    /** Extra class from the picker, for spacing that belongs to the picker. */
    className?: string
}

export default function PoweredByGoogle({ className }: PoweredByGoogleProps) {
    const [failed, setFailed] = useState(false)

    const rootClass = `${styles.root} ${className ?? ""}`.trim()

    if (failed) {
        // The mark still has to be readable and still has to say the words.
        return (
            <div className={rootClass}>
                <span className={styles.text}>Powered by Google</span>
            </div>
        )
    }

    return (
        <div className={rootClass}>
            <img
                src={ON_WHITE}
                alt="Powered by Google"
                className={`${styles.logo} ${styles.logoLight}`}
                width={144}
                height={18}
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
            />
            <img
                src={ON_NON_WHITE}
                alt=""
                aria-hidden="true"
                className={`${styles.logo} ${styles.logoDark}`}
                width={144}
                height={18}
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
            />
        </div>
    )
}
