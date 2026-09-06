"use client"

/**
 * /recruitments — player-facing recruitments hub.
 *
 * Three URL-synced tabs (?tab=applications / ?tab=saved survives refresh /
 * back):
 *   1. Recruitments    — global discovery feed with filters
 *   2. Saved           — the shortlist, most recently saved first
 *   3. Applied         — the player's own applications
 */

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import RecruitmentDiscovery from "@/features/recruitments/components/RecruitmentDiscovery/RecruitmentDiscovery"
import MyApplications from "@/features/recruitments/components/MyApplications/MyApplications"
import SavedRecruitmentsList from "@/features/recruitments/components/SavedRecruitmentsList/SavedRecruitmentsList"
import styles from "./page.module.css"

type Tab = "recruitments" | "saved" | "applications"

function RecruitmentsHub() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const param = searchParams.get("tab")
  const tab: Tab =
    param === "applications" || param === "saved" ? param : "recruitments"

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    // "recruitments" is the default and stays out of the URL; the other two
    // name themselves, so a shared link opens on the tab it was copied from.
    if (next !== "recruitments") params.set("tab", next)
    else params.delete("tab")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Recruitments</h1>
        <p className={styles.subtitle}>
          Discover open trials and track your applications.
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Recruitments sections">
        <button
          type="button"
          role="tab"
          id="tab-recruitments"
          aria-selected={tab === "recruitments"}
          aria-controls="panel-recruitments"
          className={`${styles.tab} ${tab === "recruitments" ? styles.tabActive : ""}`}
          onClick={() => setTab("recruitments")}
        >
          Recruitments
        </button>
        <button
          type="button"
          role="tab"
          id="tab-saved"
          aria-selected={tab === "saved"}
          aria-controls="panel-saved"
          className={`${styles.tab} ${tab === "saved" ? styles.tabActive : ""}`}
          onClick={() => setTab("saved")}
        >
          Saved
        </button>
        <button
          type="button"
          role="tab"
          id="tab-applications"
          aria-selected={tab === "applications"}
          aria-controls="panel-applications"
          className={`${styles.tab} ${tab === "applications" ? styles.tabActive : ""}`}
          onClick={() => setTab("applications")}
        >
          {/* "Applied", not "My Applications": three tabs share one row and
              the two-word label wrapped onto a second line on a phone. The
              ?tab= value stays `applications` so existing links still open
              here. */}
          Applied
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-recruitments"
        aria-labelledby="tab-recruitments"
        tabIndex={0}
        className={styles.panel}
        hidden={tab !== "recruitments"}
      >
        {tab === "recruitments" && <RecruitmentDiscovery />}
      </div>

      <div
        role="tabpanel"
        id="panel-saved"
        aria-labelledby="tab-saved"
        tabIndex={0}
        className={styles.panel}
        hidden={tab !== "saved"}
      >
        {tab === "saved" && <SavedRecruitmentsList />}
      </div>

      <div
        role="tabpanel"
        id="panel-applications"
        aria-labelledby="tab-applications"
        tabIndex={0}
        className={styles.panel}
        hidden={tab !== "applications"}
      >
        {tab === "applications" && (
          <MyApplications onBrowse={() => setTab("recruitments")} />
        )}
      </div>
    </div>
  )
}

export default function RecruitmentsPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.fallback} aria-hidden="true" />
        </div>
      }
    >
      <RecruitmentsHub />
    </Suspense>
  )
}
