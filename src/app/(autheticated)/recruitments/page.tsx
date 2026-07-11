"use client"

/**
 * /recruitments — player-facing recruitments hub.
 *
 * Two URL-synced tabs (?tab=applications survives refresh / back):
 *   1. Recruitments   — global discovery feed with filters
 *   2. My Applications — the player's own applications
 */

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import RecruitmentDiscovery from "@/features/recruitments/components/RecruitmentDiscovery/RecruitmentDiscovery"
import MyApplications from "@/features/recruitments/components/MyApplications/MyApplications"
import styles from "./page.module.css"

type Tab = "recruitments" | "applications"

function RecruitmentsHub() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tab: Tab =
    searchParams.get("tab") === "applications" ? "applications" : "recruitments"

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "applications") params.set("tab", "applications")
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
          id="tab-applications"
          aria-selected={tab === "applications"}
          aria-controls="panel-applications"
          className={`${styles.tab} ${tab === "applications" ? styles.tabActive : ""}`}
          onClick={() => setTab("applications")}
        >
          My Applications
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
