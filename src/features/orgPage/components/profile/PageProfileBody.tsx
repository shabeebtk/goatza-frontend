"use client"

import { Fragment, type ReactNode, type RefObject } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import RecruitmentsList from "@/features/recruitments/components/RecruitmentsList/RecruitmentsList"
import OrgSquadsSection from "@/features/squads/components/OrgSquadsSection/OrgSquadsSection"
import { ORG_PERMISSIONS, hasOrgPermission } from "@/shared/permissions/orgPermissions"
import { useAuthStore } from "@/store/auth.store"
import { useShowcaseSquadCount, useTrialCount } from "../../hooks/useProfilePresence"
import {
  QUICK_FACT_KEYS,
  aboutHasContent,
  bodySlots,
  facilitiesWithContent,
  knownOrder,
  renderedSections,
  type BodySlot,
  type ProfileLocation,
  type SectionPresence,
} from "../../profileSections"
import { pageBase } from "../../sectionMeta"
import type { PageShowcase } from "../../types"
import AboutSection from "./AboutSection"
import CoachesSection from "./CoachesSection"
import FacilitiesSection from "./FacilitiesSection"
import LocationsSection from "./LocationsSection"
import PageSectionBar, { MIN_BAR_SECTIONS } from "./PageSectionBar"
import PlayersSection from "./PlayersSection"
import ProfileSection, { SectionAnchor } from "./ProfileSection"
import ProgramsSection from "./ProgramsSection"
import styles from "./PageProfileBody.module.css"

/** What the body reads from the profile bundle the page already has. */
export type PageProfileOrg = {
  id: string
  username: string
  name: string
  type: string
  logo: string
  description: string
  website: string
  level: string
  locations: ProfileLocation[]
}

/**
 * The profile's body once the page has answered: every section in
 * `page.order` (the org type's order, switched-off sections already gone),
 * each drawing nothing at all when it has nothing, the Sports grid after the
 * about slot, posts last, and the sticky bar over whichever rendered.
 *
 * The same for everyone, the org's own admin profile included: a section the
 * club switched off is hidden from its own members too. The admin gets one quiet
 * "Manage your page" link above it all.
 *
 * With the desktop aside (`aside`, from 1024px) the branches and the quick
 * facts are drawn there instead, so they leave this column and the bar.
 */
export default function PageProfileBody({
  page,
  org,
  isMe,
  isPublicView,
  headerRef,
  sports,
  aside = false,
  onCreatePost,
}: {
  page: PageShowcase
  org: PageProfileOrg
  /** The org's own admin profile. */
  isMe: boolean
  /** Logged out: squads read the public endpoint. */
  isPublicView: boolean
  /** The header's action row: the bar shows once it has scrolled away. */
  headerRef: RefObject<HTMLElement | null>
  /** The profile's Sports grid, or null when the org lists no sports. */
  sports: ReactNode | null
  /** The desktop aside is beside this column, holding Locations and the quick facts. */
  aside?: boolean
  onCreatePost: () => void
}) {
  const squadCount = useShowcaseSquadCount(org.username, isPublicView)
  const trialCount = useTrialCount(org.username)
  const canManagePage = useAuthStore((state) =>
    hasOrgPermission(
      state.organizations.find((organization) => organization.id === org.id),
      ORG_PERMISSIONS.PAGE_MANAGE
    )
  )

  // Every list defaults to empty: a payload short of one must not break the profile.
  const order = knownOrder(page.order).filter((key) => !(aside && key === "locations"))
  const omitFacts = aside ? QUICK_FACT_KEYS : []
  const programs = page.programs ?? []
  const facilities = facilitiesWithContent(page.facilities)
  const coaches = page.coaches ?? []
  const players = page.players ?? []
  const locations = org.locations ?? []
  const presence: SectionPresence = {
    about:
      isMe ||
      aboutHasContent({
        orgName: org.name,
        description: org.description,
        website: org.website,
        level: org.level,
        facts: page.facts,
        omitFacts,
      }),
    programs: programs.length > 0,
    facilities: facilities.length > 0,
    coaches: coaches.length > 0,
    players: players.length > 0,
    squads: squadCount > 0,
    locations: locations.length > 0,
    // The owner keeps today's empty state; anyone else sees nothing.
    trials: isMe || trialCount > 0,
    posts: true,
  }
  const rendered = renderedSections(order, presence)
  const slots = bodySlots(order, rendered, Boolean(sports))

  const slot = (key: BodySlot): ReactNode => {
    switch (key) {
      case "about":
        return (
          <AboutSection
            orgName={org.name}
            description={org.description ?? ""}
            website={org.website ?? ""}
            level={org.level ?? ""}
            facts={page.facts}
            isMe={isMe}
            omitFacts={omitFacts}
          />
        )
      case "sports":
        return (
          <ProfileSection sectionKey="sports" title="Sports">
            {sports}
          </ProfileSection>
        )
      case "programs":
        // The org's own admins get no Enquire on the cards: the form is for visitors.
        return <ProgramsSection programs={programs} enquiryForm={Boolean(page.contact?.enquiry_form) && !isMe} />
      case "facilities":
        return <FacilitiesSection facilities={facilities} />
      case "coaches":
        return <CoachesSection coaches={coaches} />
      case "players":
        return <PlayersSection players={players} orgType={org.type} />
      case "squads":
        // OrgSquadsSection brings its own divider and heading.
        return (
          <SectionAnchor sectionKey="squads">
            <OrgSquadsSection orgId={org.id} username={org.username} anonymous={isPublicView} />
          </SectionAnchor>
        )
      case "locations":
        return <LocationsSection locations={locations} />
      case "trials":
        return (
          <SectionAnchor sectionKey="trials" label="Trials" divider>
            <RecruitmentsList
              username={org.username}
              isOwn={isMe}
              preview
              showOrg={false}
              hideWhenEmpty={!isMe}
            />
          </SectionAnchor>
        )
      case "posts":
        return (
          <SectionAnchor sectionKey="posts" label="Posts" divider>
            <PostsList
              username={org.username}
              type="organization"
              isOwn={isMe}
              preview
              onCreatePost={onCreatePost}
            />
          </SectionAnchor>
        )
    }
  }

  return (
    <div className={styles.body}>
      {rendered.length >= MIN_BAR_SECTIONS && (
        <PageSectionBar sections={rendered} headerRef={headerRef} orgName={org.name} logo={org.logo} />
      )}

      {isMe && canManagePage && (
        <Link href={pageBase(org.id)} className={styles.manage}>
          <Icon icon="mdi:tune-variant" width={16} height={16} aria-hidden="true" />
          Manage your page
        </Link>
      )}

      {slots.map((key) => (
        <Fragment key={key}>{slot(key)}</Fragment>
      ))}
    </div>
  )
}
