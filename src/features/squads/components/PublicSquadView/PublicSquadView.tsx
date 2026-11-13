"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import PublicCtaBar from "@/features/profile/components/PublicCtaBar/PublicCtaBar"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import UnavailableState from "@/shared/components/UnavailableState/UnavailableState"
import { useSmartBack } from "@/shared/hooks/useSmartBack"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import { profilePath } from "@/shared/services/profileUrl"
import { useAuthStore } from "@/store/auth.store"
import { useShareLink } from "../../hooks/useShareLink"
import { usePublicSquadPage, useSquadShowcasePage } from "../../hooks/useSquadShowcase"
import { countLabel, firstName, initialsOf, publicSquadPath } from "../../squadUtils"
import type { ShowcaseGroup, ShowcaseMember, ShowcaseSquadPage } from "../../types"
import type { SeedStatus } from "../PublicSquadsList/PublicSquadsList"
import { ShowcaseAvatar } from "../ShowcaseSquadCard/ShowcaseSquadCard"
import styles from "./PublicSquadView.module.css"

function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

function findMember(groups: ShowcaseGroup[], memberId: string | null): ShowcaseMember | undefined {
  if (!memberId) return undefined
  for (const group of groups) {
    const member = group.members.find((row) => row.id === memberId)
    if (member) return member
  }
  return undefined
}

// ── The hero (always dark) ────────────────────────────────────

function Hero({
  data,
  onShare,
}: {
  data: ShowcaseSquadPage
  onShare: () => void
}) {
  const { squad, organization } = data
  const clubPath = profilePath(organization.username, "organization")
  const goBack = useSmartBack(clubPath)
  const chips = [squad.sport.name, squad.level_label, squad.season].filter(Boolean)

  return (
    <header className={styles.hero}>
      {squad.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={squad.photo_url} alt="" className={styles.heroPhoto} />
      ) : (
        <span className={styles.pitch} aria-hidden="true">
          <span className={styles.pitchHalfway} />
          <span className={styles.pitchCircle} />
        </span>
      )}
      <span className={styles.heroScrim} aria-hidden="true" />

      {/* Phone: back and share sit on the photo. */}
      <div className={styles.heroTop}>
        <button type="button" className={styles.roundBtn} onClick={goBack} aria-label="Go back">
          <Icon icon="mdi:arrow-left" width={22} height={22} />
        </button>
        <button type="button" className={styles.roundBtn} onClick={onShare} aria-label="Share squad">
          <Icon icon="mdi:share-variant-outline" width={20} height={20} />
        </button>
      </div>

      <div className={styles.heroBody}>
        <Link href={clubPath} className={styles.club}>
          <span className={styles.clubLogo} aria-hidden="true">
            {organization.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organization.logo} alt="" />
            ) : (
              initialsOf(organization.name)
            )}
          </span>
          <span className={styles.clubName}>{organization.name}</span>
          {organization.is_verified && (
            <Icon
              icon="mdi:check-decagram"
              width={16}
              height={16}
              className={styles.verified}
              aria-label="Verified"
            />
          )}
        </Link>

        <h1 className={styles.squadName}>{squad.name}</h1>

        <div className={styles.heroFoot}>
          {chips.length > 0 && (
            <ul className={styles.chips} aria-label="About this squad">
              {chips.map((chip) => (
                <li key={chip} className={styles.chip}>
                  {chip}
                </li>
              ))}
            </ul>
          )}
          {/* Desktop: share is a labelled button in the hero. */}
          <button type="button" className={styles.shareBtn} onClick={onShare}>
            <Icon icon="mdi:share-variant-outline" width={18} height={18} aria-hidden="true" />
            Share
          </button>
        </div>
      </div>
    </header>
  )
}

// ── Below the hero (follows the theme) ────────────────────────

function Stats({ data }: { data: ShowcaseSquadPage }) {
  const captain = findMember(data.groups, data.captain_member_id)
  const captainValue = captain
    ? data.config.uses_jersey_numbers && captain.jersey_number != null
      ? `#${captain.jersey_number}`
      : firstName(captain.name)
    : null

  return (
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt>{capitalise(data.config.member_noun_plural) || "Players"}</dt>
        <dd>{data.counts.players}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Staff</dt>
        <dd>{data.counts.staff}</dd>
      </div>
      {captainValue && (
        <div className={styles.stat}>
          <dt>Captain</dt>
          <dd>{captainValue}</dd>
        </div>
      )}
    </dl>
  )
}

function PlayerCard({
  member,
  usesNumbers,
}: {
  member: ShowcaseMember
  usesNumbers: boolean
}) {
  const line = [
    member.position?.name,
    usesNumbers && member.jersey_number != null ? `#${member.jersey_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const body = (
    <>
      {usesNumbers && member.jersey_number != null && (
        <span className={styles.bigNumber} aria-hidden="true">
          {member.jersey_number}
        </span>
      )}
      <span className={styles.playerAvatarWrap}>
        <ShowcaseAvatar name={member.name} photo={member.photo} size={44} />
        {member.is_captain && (
          <span className={styles.captainBadge} title="Captain">
            <span aria-hidden="true">C</span>
            <span className="sr-only">Captain</span>
          </span>
        )}
      </span>
      <span className={styles.playerName}>{member.name}</span>
      {line && <span className={styles.playerLine}>{line}</span>}
    </>
  )

  const className = `${styles.playerCard} ${member.is_captain ? styles.playerCaptain : ""}`

  return member.username ? (
    <Link href={profilePath(member.username, "user")} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function StaffChipBody({ name, photo, role }: { name: string; photo: string; role: string }) {
  return (
    <>
      <ShowcaseAvatar name={name} photo={photo} size={32} />
      <span className={styles.staffText}>
        <span className={styles.staffName}>{name}</span>
        <span className={styles.staffRole}>{role}</span>
      </span>
    </>
  )
}

function HiddenTile({
  count,
  noun,
  nounPlural,
  nextPath,
}: {
  count: number
  noun: string
  nounPlural: string
  nextPath: string
}) {
  return (
    <Link href={authUrlWithNext(nextPath, "login")} className={styles.hiddenTile}>
      <Icon icon="mdi:lock-outline" width={22} height={22} aria-hidden="true" />
      <span className={styles.hiddenCount}>
        {count} more {count === 1 ? noun : nounPlural}
      </span>
      <span className={styles.hiddenAction}>Sign in to see</span>
    </Link>
  )
}

function Groups({ data, anonymous }: { data: ShowcaseSquadPage; anonymous: boolean }) {
  const usesNumbers = data.config.uses_jersey_numbers
  const noun = data.config.member_noun || "player"
  const nounPlural = data.config.member_noun_plural || "players"
  const nextPath = publicSquadPath(data.organization.username, data.squad.id)

  return (
    <div className={styles.groups}>
      {data.groups
        .filter((group) => group.count > 0)
        .map((group) => (
          <section key={group.name} className={styles.group} aria-label={group.name}>
            <h2 className={styles.groupTitle}>
              {group.name} <span className={styles.groupCount}>{group.count}</span>
            </h2>
            <div className={styles.playerGrid}>
              {group.members.map((member) => (
                <PlayerCard key={member.id} member={member} usesNumbers={usesNumbers} />
              ))}
              {anonymous && group.hidden_count > 0 && (
                <HiddenTile
                  count={group.hidden_count}
                  noun={noun}
                  nounPlural={nounPlural}
                  nextPath={nextPath}
                />
              )}
            </div>
          </section>
        ))}
    </div>
  )
}

/** The hero and four cards: the page's own loading shape (its loading.tsx too). */
export function SquadPageSkeleton() {
  return (
    <div className={styles.page} aria-hidden="true">
      <div className={`${styles.hero} ${styles.heroSkeleton}`}>
        <span className={styles.pitch} />
      </div>
      <div className={styles.playerGrid}>
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={styles.skeletonCard} />
        ))}
      </div>
    </div>
  )
}

/**
 * A squad's public page: the showcase. The hero is always dark (the squad's
 * photo, or a dark pitch), and everything under it follows the theme. Signed in,
 * the page is read in the browser as the viewer; anonymous, the server's read
 * seeds it. One miss screen for everything the server refuses.
 */
export default function PublicSquadView({
  username,
  squadId,
  initial,
  initialStatus,
}: {
  username: string
  squadId: string
  initial: ShowcaseSquadPage | null
  initialStatus: SeedStatus
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isAuthLoading = useAuthStore((state) => state.isLoading)
  const { share } = useShareLink()

  const signedIn = useSquadShowcasePage(username, squadId, !isAuthLoading && isAuthenticated)
  const fallback = usePublicSquadPage(
    username,
    squadId,
    !isAuthLoading && !isAuthenticated && initialStatus === "unavailable"
  )

  if (isAuthLoading || (isAuthenticated && signedIn.isLoading) || fallback.isLoading) {
    return <SquadPageSkeleton />
  }

  const data = isAuthenticated ? signedIn.data : (initial ?? fallback.data)
  if (!data) {
    return <UnavailableState icon="mdi:shield-off-outline" title="This squad isn't available." />
  }

  const { squad, organization } = data
  const orgName = organization.name || organization.username
  const path = publicSquadPath(organization.username, squad.id)

  const onShare = () =>
    void share({
      title: `${squad.name} · ${orgName}`,
      text: `${squad.name} at ${orgName} on Goatza`,
      url: `${siteOrigin()}${path}`,
    })

  return (
    <div className={styles.page}>
      <Hero data={data} onShare={onShare} />
      <Stats data={data} />

      <div className={styles.layout}>
        {squad.description && (
          <section className={`${styles.block} ${styles.about}`} aria-labelledby="squad-about">
            <h2 id="squad-about" className={styles.blockTitle}>
              About
            </h2>
            <p className={styles.aboutText}>{squad.description}</p>
          </section>
        )}

        {data.staff.length > 0 && (
          <section className={`${styles.block} ${styles.staff}`} aria-labelledby="squad-staff">
            <h2 id="squad-staff" className={styles.blockTitle}>
              Staff
            </h2>
            <ul className={styles.staffList}>
              {data.staff.map((person) => (
                <li key={`${person.username || person.name}-${person.role_label}`}>
                  {person.username ? (
                    <Link
                      href={profilePath(person.username, "user")}
                      className={styles.staffChip}
                    >
                      <StaffChipBody name={person.name} photo={person.photo} role={person.role_label} />
                    </Link>
                  ) : (
                    <span className={styles.staffChip}>
                      <StaffChipBody name={person.name} photo={person.photo} role={person.role_label} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className={styles.main}>
          <Groups data={data} anonymous={!isAuthenticated} />
        </div>

        {data.other_squads.length > 0 && (
          <section className={`${styles.block} ${styles.more}`} aria-labelledby="squad-more">
            <h2 id="squad-more" className={styles.blockTitle}>
              More from {orgName}
            </h2>
            <ul className={styles.moreList}>
              {data.other_squads.map((other) => (
                <li key={other.id}>
                  <Link
                    href={publicSquadPath(organization.username, other.id)}
                    className={styles.moreRow}
                  >
                    <span className={styles.moreIcon} aria-hidden="true">
                      <Icon
                        icon={other.sport.icon_name || "mdi:shield-account-outline"}
                        width={20}
                        height={20}
                      />
                    </span>
                    <span className={styles.moreText}>
                      <span className={styles.moreName}>{other.name}</span>
                      <span className={styles.moreMeta}>
                        {countLabel(other.members_count, "player", "players")}
                      </span>
                    </span>
                    <Icon icon="mdi:chevron-right" width={18} height={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {!isAuthenticated && <PublicCtaBar displayName={orgName} nextPath={path} />}
    </div>
  )
}
