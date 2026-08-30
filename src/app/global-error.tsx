"use client"

import { useEffect } from "react"
import { Icon } from "@iconify/react"
// The root layout never renders when this boundary is active, so its
// globals.css import doesn't run either — pull the design tokens in directly or
// every var() below resolves to nothing.
import "./globals.css"
import styles from "./global-error.module.css"

/**
 * Last-resort boundary — catches errors thrown by the root layout itself
 * (providers, QueryProvider, font setup) which error.tsx sits inside of and
 * therefore cannot catch. It *replaces* the root layout, which is why it has to
 * render its own <html> and <body>.
 *
 * Everything the layout normally provides is gone here: no fonts, no providers,
 * no router-backed nav. Keep this component dependency-free on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // `digest` is all that survives of a server-thrown error in production —
    // it's the join key to the server log line.
    console.error("[error-boundary] global", { digest: error.digest, error })

    // TODO(sentry): report once Sentry is installed —
    //   Sentry.captureException(error, {
    //     tags: { boundary: "global" },
    //     extra: { digest: error.digest },
    //   })
    // This boundary means the whole app failed to mount, so it's the one we most
    // need reported — nobody sees these until we're wired up.
  }, [error])

  return (
    <html lang="en">
      <body>
        <div className={styles.page}>
          <div className={styles.grid} aria-hidden="true" />

          <div className={styles.content}>

            <Icon
              icon="mdi:flag-checkered"
              className={styles.heroIcon}
              width="1em"
              height="1em"
              aria-hidden="true"
            />

            <div className={styles.textBlock}>
              <h1 className={styles.title}>Match Abandoned</h1>
              <p className={styles.body}>
                The whole app went down before kickoff. A reload usually gets us
                back on the pitch.
              </p>
            </div>

            {error.digest && (
              <p className={styles.digest}>Ref: {error.digest}</p>
            )}

            {/* Dev only — the raw message can leak stack frames and internal
                paths, so it never reaches a real user. */}
            {process.env.NODE_ENV !== "production" && error.message && (
              <pre className={styles.devMessage}>{error.message}</pre>
            )}

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={reset} type="button">
                <Icon icon="mdi:refresh" width={17} height={17} />
                Try Again
              </button>
              <button
                className={styles.btnGhost}
                // Hard navigation, not router.push: the router tree hanging off
                // the broken root layout is exactly what we're escaping, so a
                // client-side nav would just re-render the crash.
                onClick={() => window.location.assign("/home")}
                type="button"
              >
                <Icon icon="mdi:home-outline" width={17} height={17} />
                Go Home
              </button>
            </div>

          </div>
        </div>
      </body>
    </html>
  )
}
