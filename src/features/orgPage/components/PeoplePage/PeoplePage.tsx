"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { orgNoun } from "../../format"
import { usePageOrg } from "../../hooks/usePageOrg"
import { pageBase } from "../../sectionMeta"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import PageSegmented from "../PageSegmented/PageSegmented"
import RequirePagePermission from "../RequirePagePermission/RequirePagePermission"
import CoachesTab from "./CoachesTab"
import PlayersTab from "./PlayersTab"
import styles from "./PeoplePage.module.css"

export type PeopleTab = "coaches" | "players"

/**
 * Coaches and "Players we developed", one page with two tabs. The tabs REPLACE
 * the route (?tab=players), so back leaves the page rather than the tab.
 */
export default function PeoplePage({ orgId, tab }: { orgId: string; tab: PeopleTab }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <People orgId={orgId} tab={tab} />
    </RequirePagePermission>
  )
}

function People({ orgId, tab: requested }: { orgId: string; tab: PeopleTab }) {
  const router = useRouter()
  const org = usePageOrg(orgId)
  const noun = orgNoun(org?.type)

  // The tab moves at once; the route follows. A route change from elsewhere
  // (back, forward) moves it too.
  const [tab, setTab] = useState<PeopleTab>(requested)
  const [seen, setSeen] = useState(requested)
  if (seen !== requested) {
    setSeen(requested)
    setTab(requested)
  }

  const choose = (next: PeopleTab) => {
    if (next === tab) return
    setTab(next)
    router.replace(`${pageBase(orgId)}/people${next === "players" ? "?tab=players" : ""}`, {
      scroll: false,
    })
  }

  return (
    <PageEditorLayout orgId={orgId} title="Coaches & players">
      <PageSegmented
        kind="tablist"
        label="Coaches or players"
        options={[
          { value: "coaches", label: "Coaches" },
          { value: "players", label: "Players" },
        ]}
        value={tab}
        onChange={choose}
      />
      <div role="tabpanel" aria-label={tab === "coaches" ? "Coaches" : "Players"} className={styles.panel}>
        {tab === "coaches" ? (
          <CoachesTab orgId={orgId} />
        ) : (
          <PlayersTab orgId={orgId} noun={noun} />
        )}
      </div>
    </PageEditorLayout>
  )
}
