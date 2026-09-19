/**
 * The loading silhouettes for the two public shapes: a profile card and a CV
 * sheet.
 *
 * ONE SHAPE PER PAGE, PAINTED AT EVERY STAGE. A profile opened from the feed
 * goes through up to three waits — the route segment streaming in, the auth
 * store resolving on a cold load, and <UserProfile>'s own fetch for a signed-in
 * viewer — and each used to draw its own placeholder. Three silhouettes in a
 * row read as three separate loads. Every stage now renders this component, so
 * the placeholder simply stays put until the real page replaces it.
 *
 * Every measurement is taken from the page it stands in for — UserProfile's
 * 760px card for the profile, PublicCVView's --container-tight sheet for the
 * CV — so the real page swaps in without the layout jumping.
 *
 * `withNavBand` is the one thing the callers disagree on. PublicShell's
 * loading branch replaces the WHOLE chrome (the real nav is fixed and spans the
 * viewport, so a band stands in for it); a route's loading.tsx and
 * <UserProfile> render INSIDE a real shell whose nav is already there, and a
 * second band under it would be a visible extra bar.
 *
 * The two shapes live in one file because they share every primitive — the
 * lines, chips, rows and the pulse. They are two shapes rather than one
 * because the difference is the first thing on the page: a full-width cover
 * that then vanishes is a worse wait for a CV than no cover at all.
 */

import styles from "./ProfileSkeleton.module.css"

type SkeletonProps = {
  /**
   * Draw a stand-in for the fixed top nav above the content, and take the
   * viewport's height and background — only when the skeleton IS the page,
   * with no real shell around it.
   */
  withNavBand?: boolean
}

/**
 * The profile shape: cover → avatar overlapping it → name, chips, stats,
 * buttons — the top of the real card, in the same 760px centred column.
 */
export default function ProfileSkeleton({ withNavBand = false }: SkeletonProps) {
  return (
    <div className={withNavBand ? styles.shell : undefined} aria-hidden="true">
      {withNavBand && <div className={styles.navBand} />}

      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cover} />

          <div className={styles.body}>
            <div className={styles.avatar} />
            <div className={styles.line} />
            <div className={styles.lineSm} />

            <div className={styles.row}>
              <span className={styles.chip} />
              <span className={styles.chip} />
              <span className={styles.chip} />
            </div>

            <div className={styles.row}>
              <span className={styles.stat} />
              <span className={styles.stat} />
              <span className={styles.stat} />
            </div>

            <div className={styles.row}>
              <span className={styles.btn} />
              <span className={styles.btn} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The CV shape: no cover, a photo beside the name, then the fact grid, the
 * action row and two sections.
 */
export function CVSkeleton({ withNavBand = false }: SkeletonProps) {
  return (
    <div className={withNavBand ? styles.shell : undefined} aria-hidden="true">
      {withNavBand && <div className={styles.navBand} />}

      <div className={styles.sheet}>
        <div className={styles.cvHeader}>
          <div className={styles.cvPhoto} />
          <div className={styles.cvHeaderText}>
            <div className={styles.line} />
            <div className={styles.lineSm} />
            <div className={styles.row}>
              <span className={styles.chip} />
              <span className={styles.chip} />
            </div>
          </div>
        </div>

        <div className={styles.box} />

        <div className={styles.row}>
          <span className={styles.btn} />
          <span className={styles.btn} />
        </div>

        <div className={styles.section} />
        <div className={styles.section} />
      </div>
    </div>
  )
}
