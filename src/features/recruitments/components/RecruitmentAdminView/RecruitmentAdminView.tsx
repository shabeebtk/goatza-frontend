"use client"

/**
 * RecruitmentAdminView — org-admin recruitment page body.
 *
 * Details | Applicants (N) tabs. The active tab lives in the URL (?tab=applicants)
 * so notification deep-links land on the applicants list and the tab survives
 * refresh / share. Renders the existing owner detail (+ edit wizard) or the
 * read-only ApplicantsList.
 */

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import RecruitmentDetail from "../RecruitmentDetail/RecruitmentDetail"
import CreateRecruitmentTrigger from "../CreateRecruitmentModal/CreateRecruitmentTrigger"
import ApplicantsList from "../ApplicantsList/ApplicantsList"
import { useRecruitmentDetail } from "../../hooks/useRecruitments"
import AnnouncementComposer, {
    type AnnouncementPrefill,
} from "../AnnouncementComposer/AnnouncementComposer"
import { buildReschedulePrefill } from "../../announcementPrefill"
import type { RecruitmentDetail as RecruitmentDetailType } from "../../services/recruitments.api"
import styles from "./RecruitmentAdminView.module.css"

type Tab = "details" | "applicants"

export default function RecruitmentAdminView({ recruitmentId }: { recruitmentId: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const tab: Tab = searchParams.get("tab") === "applicants" ? "applicants" : "details"

  const { data: recruitment } = useRecruitmentDetail(recruitmentId)
  const [editOpen, setEditOpen] = useState(false)

  // The composer, opened either by the button or by an edit that moved a
  // date. `prefill` is what makes those two the same screen.
  const [composerOpen, setComposerOpen] = useState(false)
  const [prefill, setPrefill] = useState<AnnouncementPrefill | undefined>()

  // The recruitment AS THE WIZARD LOADED IT, kept so a reschedule
  // announcement can name both ends of the move — "moved from Sun 19 Oct
  // to Mon 20 Oct" is the sentence a player can act on.
  const [beforeEdit, setBeforeEdit] = useState<RecruitmentDetailType | null>(
    null,
  )

  // The freshest detail, for the post-update callback: `recruitment` is
  // captured by the closure at render time and would be the pre-edit copy.
  const latestRecruitment = useRef<RecruitmentDetailType | null>(null)
  useEffect(() => {
    latestRecruitment.current = recruitment ?? null
  }, [recruitment])

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

      {/* The org's own way in. Owner/admin only is enforced server-side;
          a coach pressing this gets the API's 403 verbatim. */}
      {tab === "details" && recruitment && (
        <button
          className={styles.announceBtn}
          onClick={() => {
            setPrefill(undefined)
            setComposerOpen(true)
          }}
          type="button"
        >
          <Icon icon="mdi:bullhorn-outline" width={16} height={16} />
          Post an announcement
        </button>
      )}

      {tab === "details" ? (
        <RecruitmentDetail
          recruitmentId={recruitmentId}
          isOrgView
          onEdit={() => setEditOpen(true)}
        />
      ) : (
        <div className={styles.applicantsPanel}>
          {/* Age groups, type and trial day ride along on the detail we
              already fetched, so the group filter, the per-type wording and
              the Result tab's "opens on" line cost no extra request. */}
          <ApplicantsList
            recruitmentId={recruitmentId}
            ageCategories={recruitment?.age_categories ?? []}
            recruitmentType={recruitment?.recruitment_type}
            eventDate={recruitment?.event_date ?? null}
            timezone={recruitment?.timezone}
            hasFee={!!recruitment?.is_paid}
            sessionMode={recruitment?.session_mode}
            recruitmentTitle={recruitment?.title}
            orgName={recruitment?.organization?.name}
          />
        </div>
      )}

      {/* Edit wizard — reuses the create flow prefilled; only mounted once the
          owner detail has loaded so it prefills correctly. */}
      {recruitment && (
        <CreateRecruitmentTrigger
          mode="edit"
          initialRecruitment={recruitment}
          open={editOpen}
          onOpenChange={(next) => {
            // Snapshot before the wizard mutates anything, so the
            // reschedule sentence has a "from" to name.
            if (next) setBeforeEdit(recruitment)
            setEditOpen(next)
          }}
          onUpdated={(_id, scheduleChangedFields) => {
            setEditOpen(false)

            // EMPTY means nothing schedule-related moved, or there is
            // nobody to tell. Either way: no prompt, silently.
            if (!scheduleChangedFields?.length || !beforeEdit) return

            // The detail query refetches on update; read the NEW dates
            // from it a tick later so the sentence names where they moved
            // TO, not where they were.
            setTimeout(() => {
              const after = latestRecruitment.current
              if (!after) return
              const built = buildReschedulePrefill(
                scheduleChangedFields, beforeEdit, after,
              )
              if (!built) return
              setPrefill(built)
              setComposerOpen(true)
            }, 600)
          }}
        />
      )}

      {recruitment && (
        <AnnouncementComposer
          recruitment={recruitment}
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          prefill={prefill}
        />
      )}
    </div>
  )
}
