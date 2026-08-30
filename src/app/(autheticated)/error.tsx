"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./error.module.css"

/**
 * Error boundary for every post-login page. It sits *below* the group layout,
 * so AuthGuard and AppShell keep rendering — a crashed feed or profile costs
 * the user that panel, not the whole app, and the nav bar is still there to
 * walk out with. reset() re-renders just this segment.
 */
export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Server-thrown errors arrive here with the message stripped in production;
    // `digest` is the only thing that ties this to the server log line.
    console.error("[error-boundary] authenticated", { digest: error.digest, error })

    // TODO(sentry): report once Sentry is installed —
    //   Sentry.captureException(error, {
    //     tags: { boundary: "authenticated" },
    //     extra: { digest: error.digest },
    //   })
    // Worth adding the current route as a tag too — this boundary covers every
    // feature area, so "which one broke" isn't obvious from the stack alone.
  }, [error])

  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.content}>

        <Icon
          icon="mdi:whistle"
          className={styles.heroIcon}
          width="1em"
          height="1em"
          aria-hidden="true"
        />

        <div className={styles.textBlock}>
          <h1 className={styles.title}>Play Stopped</h1>
          <p className={styles.body}>
            This section fumbled the ball. The rest of the app is fine — run it
            back, or head to the feed.
          </p>
        </div>

        {error.digest && (
          <p className={styles.digest}>Ref: {error.digest}</p>
        )}

        {/* Dev only — the raw message can leak stack frames and internal paths,
            so it never reaches a real user. */}
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
            onClick={() => router.push("/home")}
            type="button"
          >
            <Icon icon="mdi:home-outline" width={17} height={17} />
            Go Home
          </button>
        </div>

      </div>
    </div>
  )
}
