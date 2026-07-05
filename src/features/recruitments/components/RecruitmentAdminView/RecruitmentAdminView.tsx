"use client"

/**
 * RecruitmentAdminView — org-admin recruitment page body.
 *
 * Details | Applicants (N) tabs. The active tab lives in the URL (?tab=applicants)
 * so notification deep-links land on the applicants list and the tab survives
 * refresh / share. Renders the existing owner detail (+ edit wizard) or the
 * read-only ApplicantsList.
 */

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import RecruitmentDetail from "../RecruitmentDetail/RecruitmentDetail"
import CreateRecruitmentTrigger from "../CreateRecruitmentModal/CreateRecruitmentTrigger"
import ApplicantsList from "../ApplicantsList/ApplicantsList"
import { useRecruitmentDetail } from "../../hooks/useRecruitments"
import styles from "./RecruitmentAdminView.module.css"

type Tab = "details" | "applicants"

export default function RecruitmentAdminView({ recruitmentId }: { recruitmentId: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const tab: Tab = searchParams.get("tab") === "applicants" ? "applicants" : "details"

  const { data: recruitment } = useRecruitmentDetail(recruitmentId)
  const [editOpen, setEditOpen] = useState(false)

  const applicationsCount = recruitment?.applications_count ?? 0

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "applicants") params.set("tab", "applicants")
    else params.delete("tab")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tabBar} role="tablist">
        <button
          className={`${styles.tab} ${tab === "details" ? styles.tabActive : ""}`}
          onClick={() => setTab("details")}
          type="button"
          role="tab"
          aria-selected={tab === "details"}
        >
          <Icon icon="mdi:information-outline" width={16} height={16} />
          Details
        </button>
        <button
          className={`${styles.tab} ${tab === "applicants" ? styles.tabActive : ""}`}
          onClick={() => setTab("applicants")}
          type="button"
          role="tab"
          aria-selected={tab === "applicants"}
        >
          <Icon icon="mdi:account-multiple-outline" width={16} height={16} />
          Applicants
          <span className={styles.tabCount}>{applicationsCount}</span>
        </button>
      </div>

      {tab === "details" ? (
        <RecruitmentDetail
          recruitmentId={recruitmentId}
          isOrgView
          onEdit={() => setEditOpen(true)}
        />
      ) : (
        <ApplicantsList recruitmentId={recruitmentId} />
      )}

      {/* Edit wizard — reuses the create flow prefilled; only mounted once the
          owner detail has loaded so it prefills correctly. */}
      {recruitment && (
        <CreateRecruitmentTrigger
          mode="edit"
          initialRecruitment={recruitment}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
