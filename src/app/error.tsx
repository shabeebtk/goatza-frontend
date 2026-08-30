"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./error.module.css"

/**
 * Root error boundary — catches anything thrown while rendering a page under
 * the root layout. The layout itself (fonts, providers, nav) survives; only the
 * page tree is replaced, so this renders as a normal in-app screen.
 * Root layout failures fall through to global-error.tsx instead.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Next strips the message off server-thrown errors in production builds and
    // leaves only `digest` — that hash is what matches this render to the server
    // log line, so it always goes in the log even when it looks redundant here.
    console.error("[error-boundary] root", { digest: error.digest, error })

    // TODO(sentry): report once Sentry is installed —
    //   Sentry.captureException(error, {
    //     tags: { boundary: "root" },
    //     extra: { digest: error.digest },
    //   })
    // Until then a production crash exists only in the console of the person who
    // hit it, which means we hear about it only if they tell us.
  }, [error])

  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.content}>

        <Icon
          icon="mdi:card"
          className={styles.heroIcon}
          width="1em"
          height="1em"
          aria-hidden="true"
        />

        <div className={styles.textBlock}>
          <h1 className={styles.title}>Red Card</h1>
          <p className={styles.body}>
            Something on our side went down mid-play. Take another shot at it, or
            head back to the feed.
          </p>
        </div>

        {/* Safe to show: an opaque hash, and the only handle support has on a
            production failure. */}
        {error.digest && (
          <p className={styles.digest}>Ref: {error.digest}</p>
        )}

        {/* Dev only — the raw message can carry stack frames, SQL, tokens and
            internal paths, none of which belong on a user's screen. */}
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
