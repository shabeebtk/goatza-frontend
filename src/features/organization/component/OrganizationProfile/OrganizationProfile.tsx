"use client"

/**
 * GOATZA — OrgProfile
 * Fetches its own data via useOrgDetail(orgId).
 * Works for both isOwn (admin) and public visitor contexts.
 *
 * Usage:
 *   <OrgProfile orgId="019da088-…" isOwn />
 *   <OrgProfile orgId="019da088-…" />
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import { useOrgDetail, useFollowOrg } from "@/features/organization/hooks/useOrganizations"
import type { OrgLocation, OrgSport, OrganizationDetail } from "@/features/organization/types"
import styles from "./OrganizationProfile.module.css"
import OrgPhotoEditModal from "../OrgPhotoEditModal/OrgPhotoEditModal"
import EditOrgProfileModal from "../EditOrgProfileModal/EditOrgProfileModal"

// ── Constants ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    club: "Club",
    team: "Team",
    academy: "Academy",
    school: "School / College",
}

const LEVEL_LABELS: Record<string, string> = {
    amateur: "Amateur",
    semi_professional: "Semi-Pro",
    professional: "Professional",
    youth: "Youth",
}

const LEVEL_ICONS: Record<string, string> = {
    amateur: "mdi:medal-outline",
    semi_professional: "mdi:medal",
    professional: "mdi:trophy-outline",
    youth: "mdi:account-school-outline",
}

// ── Helpers ────────────────────────────────────────────────────────

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
}

function getPrimaryLocation(locations: OrgLocation[]): OrgLocation | null {
    if (!locations?.length) return null
    return locations.find((l) => l.is_primary) ?? locations[0]
}

// ── Sub-components ─────────────────────────────────────────────────

function StatPill({ value, label }: { value: number; label: string }) {
    return (
        <div className={styles.statPill}>
            <span className={styles.statValue}>{formatCount(value)}</span>
            <span className={styles.statLabel}>{label}</span>
        </div>
    )
}

function VerifiedBadge() {
    return (
        <span className={styles.verifiedBadge} title="Verified organization">
            <Icon icon="mdi:check-decagram" width={14} height={14} />
            Verified
        </span>
    )
}

function TypeBadge({ type }: { type: string }) {
    if (!type) return null
    return (
        <span className={`${styles.badge} ${styles.badgeType}`}>
            <Icon icon="mdi:office-building-outline" width={13} height={13} />
            {TYPE_LABELS[type] ?? type}
        </span>
    )
}

function LevelBadge({ level }: { level: string }) {
    if (!level || !LEVEL_LABELS[level]) return null
    return (
        <span className={`${styles.badge} ${styles.badgeLevel}`}>
            <Icon icon={LEVEL_ICONS[level] ?? "mdi:medal-outline"} width={13} height={13} />
            {LEVEL_LABELS[level]}
        </span>
    )
}

function SportBadge({ sport }: { sport: OrgSport }) {
    return (
        <span
            className={`${styles.badge} ${sport.is_primary ? styles.badgeSportPrimary : styles.badgeSport
                }`}
        >
            <Icon icon={sport.icon_name || "mdi:trophy-outline"} width={13} height={13} />
            {sport.name}
            {sport.is_primary && (
                <span className={styles.primaryDot} aria-label="Primary sport" />
            )}
        </span>
    )
}

function LocationItem({ loc }: { loc: OrgLocation }) {
    const hasCoords = loc.latitude != null && loc.longitude != null
    const mapsUrl = hasCoords
        ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`
        : loc.address
            ? `https://maps.google.com/?q=${encodeURIComponent(loc.address)}`
            : null

    const addressLine = loc.address || null
    const cityLine = [loc.city, loc.state, loc.country_code].filter(Boolean).join(", ") || null

    return (
        <div className={styles.locationItem}>
            <span className={styles.locationIcon}>
                <Icon
                    icon={loc.is_primary ? "mdi:map-marker" : "mdi:map-marker-outline"}
                    width={16}
                    height={16}
                />
            </span>
            <div className={styles.locationText}>
                {loc.name && <span className={styles.locationName}>{loc.name}</span>}
                {addressLine && <span className={styles.locationAddress}>{addressLine}</span>}
                {cityLine && <span className={styles.locationMeta}>{cityLine}</span>}
                {!loc.name && !addressLine && !cityLine && (
                    <span className={styles.locationAddress}>Location on file</span>
                )}
            </div>
            {mapsUrl && (
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.locationMapLink}
                    aria-label="Open in Google Maps"
                >
                    <Icon icon="mdi:open-in-new" width={14} height={14} />
                </a>
            )}
        </div>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────

function OrgProfileSkeleton() {
    return (
        <div className={styles.profileSkeleton}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonCover}`} />
            <div className={styles.skeletonBody}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
                <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
                <div className={`${styles.skeletonBlock} ${styles.skeletonLineSm}`} />
                <div className={styles.skeletonStats}>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className={`${styles.skeletonBlock} ${styles.skeletonStat}`} />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Error ──────────────────────────────────────────────────────────

function OrgProfileError() {
    return (
        <div className={styles.profileError}>
            <Icon icon="mdi:office-building-remove-outline" width={48} height={48} />
            <p>Organization not found.</p>
        </div>
    )
}

// ── Inner (rendered once data is available) ────────────────────────

interface OrgProfileInnerProps {
    org: OrganizationDetail
    isOwn: boolean
    orgId: string
}

function OrgProfileInner({ org, isOwn, orgId }: OrgProfileInnerProps) {
    const [photoModal, setPhotoModal] = useState<"logo" | "cover" | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    const [showAllLocations, setShowAllLocations] = useState(false)
    const [isFollowing, setIsFollowing] = useState(false)

    const { follow, unfollow } = useFollowOrg(orgId)
    const followLoading = follow.isPending || unfollow.isPending

    const handleFollow = () => { setIsFollowing(true); follow.mutate() }
    const handleUnfollow = () => { setIsFollowing(false); unfollow.mutate() }

    const allLocations = org.locations ?? []
    const visibleLocations = showAllLocations ? allLocations : allLocations.slice(0, 1)
    const primaryLocation = getPrimaryLocation(allLocations)
    const primarySport = org.sports?.find((s) => s.is_primary) ?? org.sports?.[0]
    const orgInitials = org.name?.slice(0, 2).toUpperCase() ?? "OR"


    return (
        <>
            <div className={styles.profilePage}>
                <div className={styles.profileCard}>

                {/* ── Cover ──────────────────────────────────────── */}
                <div className={styles.coverWrap}>
                    {org.cover_image ? (
                        <img src={org.cover_image} alt="" className={styles.coverImg} />
                    ) : (
                        <div className={styles.coverFallback} aria-hidden="true">
                            <Icon
                                icon={primarySport?.icon_name || "mdi:office-building"}
                                width={96}
                                height={96}
                            />
                            <div className={styles.coverGrid} aria-hidden="true" />
                        </div>
                    )}
                    <div className={styles.coverOverlay} aria-hidden="true" />

                    {isOwn && (
                        <button
                            className={styles.coverEditBtn}
                            aria-label="Change cover photo"
                            type="button"
                            onClick={() => setPhotoModal("cover")}
                        >
                            <Icon icon="mdi:camera-plus-outline" width={16} height={16} />
                            <span>Change Cover</span>
                        </button>
                    )}

                    {!isOwn && org.cover_image && (
                        <button
                            className={styles.coverViewBtn}
                            onClick={() => setPhotoModal("cover")}
                            aria-label="View cover photo"
                            type="button"
                        >
                            <Icon icon="mdi:fullscreen" width={18} height={18} />
                        </button>
                    )}
                </div>

                {/* ── Body ───────────────────────────────────────── */}
                <div className={styles.profileBody}>

                    {/* Avatar row */}
                    <div className={styles.avatarRow}>
                        <div className={styles.avatarWrap}>
                            <button
                                className={styles.avatarClickWrap}
                                onClick={() => setPhotoModal("logo")}
                                type="button"
                                aria-label={isOwn ? "Change logo" : "View logo"}

                            >
                                <Avatar
                                    src={org.logo || undefined}
                                    initials={orgInitials}
                                    size="xl"
                                    className={styles.profileAvatar}
                                />
                                {isOwn && (
                                    <span className={styles.avatarEditOverlay} aria-hidden="true">
                                        <Icon icon="mdi:camera-outline" width={22} height={22} />
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className={styles.profileActionsTop}>
                            <div className={styles.topBadgesRow}>
                                <TypeBadge type={org.type} />
                                {org.level && <LevelBadge level={org.level} />}
                            </div>
                        </div>
                    </div>

                    {/* Name + username + verified */}
                    <div className={styles.nameBlock}>
                        <div className={styles.nameRow}>
                            <h1 className={styles.profileName}>{org.name || "Unnamed Organization"}</h1>
                            {org.is_verified && <VerifiedBadge />}
                        </div>
                        <span className={styles.profileUsername}>@{org.username}</span>

                        {(org.sports?.length > 0 || primaryLocation) && (
                            <div className={styles.badgesRow}>
                                {org.sports?.map((sport) => (
                                    <SportBadge key={sport.id} sport={sport} />
                                ))}
                                {primaryLocation && (
                                    <span className={`${styles.badge} ${styles.badgeLocation}`}>
                                        <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                                        {primaryLocation.city || primaryLocation.name || "Location"}
                                        {primaryLocation.country_code && `, ${primaryLocation.country_code}`}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Headline */}
                    {org.headline ? (
                        <p className={styles.profileHeadline}>{org.headline}</p>
                    ) : isOwn ? (
                        <p className={styles.profileHeadlineEmpty}>
                            Add a headline — click Edit Organization
                        </p>
                    ) : null}

                    {/* Stats */}
                    <div className={styles.statsRow}>
                        <StatPill value={org.followers_count} label="Followers" />
                        <div className={styles.statDivider} />
                        <StatPill value={org.posts_count} label="Posts" />
                    </div>

                    {/* Action buttons */}
                    <div className={styles.profileActionsBase}>
                        {isOwn ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    fullWidth
                                    className={styles.actionBtnFull}
                                    leftIcon={<Icon icon="mdi:pencil-outline" width={15} height={15} />}
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    Edit Organization
                                </Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label="Share profile">
                                    <Icon icon="mdi:share-variant-outline" width={18} height={18} />
                                </Button>
                            </>
                        ) : (
                            <>
                                <span className={styles.actionBtnFull}>
                                    <Button
                                        variant={isFollowing ? "outline" : "brand"}
                                        size="sm"
                                        fullWidth
                                        loading={followLoading}
                                        onClick={isFollowing ? handleUnfollow : handleFollow}
                                        leftIcon={
                                            <Icon
                                                icon={isFollowing ? "mdi:check" : "mdi:plus"}
                                                width={15}
                                                height={15}
                                            />
                                        }
                                        className={isFollowing ? styles.followingBtn : undefined}
                                    >
                                        {isFollowing ? "Following" : "Follow"}
                                    </Button>
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    fullWidth
                                    className={styles.actionBtnFull}
                                    leftIcon={<Icon icon="mdi:message-outline" width={15} height={15} />}
                                >
                                    Message
                                </Button>
                                <Button variant="ghost" size="sm" iconOnly aria-label="More options">
                                    <Icon icon="mdi:dots-horizontal" width={18} height={18} />
                                </Button>
                            </>
                        )}
                    </div>

                    {/* ── About ────────────────────────────────────── */}
                    {(org.description || isOwn) && (
                        <>
                            <div className={styles.sectionDivider} />
                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>About</h2>
                                {org.description ? (
                                    <p className={styles.aboutText}>{org.description}</p>
                                ) : (
                                    <p className={styles.emptyHint}>
                                        Add a description — click Edit Organization above.
                                    </p>
                                )}
                                {org.website && (
                                    <a
                                        href={org.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.websiteLink}
                                    >
                                        <Icon icon="mdi:web" width={15} height={15} />
                                        {org.website.replace(/^https?:\/\//, "")}
                                        <Icon
                                            icon="mdi:open-in-new"
                                            width={12}
                                            height={12}
                                            className={styles.externalIcon}
                                        />
                                    </a>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Sports ───────────────────────────────────── */}
                    {org.sports?.length > 0 && (
                        <>
                            <div className={styles.sectionDivider} />
                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>Sports</h2>
                                <div className={styles.sportsGrid}>
                                    {org.sports.map((sport) => (
                                        <div
                                            key={sport.id}
                                            className={`${styles.sportCard} ${sport.is_primary ? styles.sportCardPrimary : ""
                                                }`}
                                        >
                                            <span className={styles.sportCardIcon}>
                                                <Icon
                                                    icon={sport.icon_name || "mdi:trophy-outline"}
                                                    width={22}
                                                    height={22}
                                                />
                                            </span>
                                            <span className={styles.sportCardName}>{sport.name}</span>
                                            {sport.is_primary && (
                                                <span className={styles.sportCardPrimaryLabel}>Primary</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Locations ────────────────────────────────── */}
                    {allLocations.length > 0 && (
                        <>
                            <div className={styles.sectionDivider} />
                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    {allLocations.length > 1 ? "Locations" : "Location"}
                                </h2>
                                <div className={styles.locationsList}>
                                    {visibleLocations.map((loc) => (
                                        <LocationItem key={loc.id} loc={loc} />
                                    ))}
                                </div>
                                {allLocations.length > 1 && (
                                    <button
                                        className={styles.showMoreBtn}
                                        onClick={() => setShowAllLocations((p) => !p)}
                                    >
                                        {showAllLocations
                                            ? "Show less"
                                            : `Show ${allLocations.length - 1} more location${allLocations.length - 1 > 1 ? "s" : ""
                                            }`}
                                        <Icon
                                            icon={showAllLocations ? "mdi:chevron-up" : "mdi:chevron-down"}
                                            width={16}
                                            height={16}
                                        />
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {/* Future sections (Posts, Achievements, Facilities) slot in here */}

                </div>
            </div>
        </div>
        
        {/* ── Modals ── */}
            {photoModal && (
                <OrgPhotoEditModal
                    type={photoModal}
                    currentSrc={photoModal === "logo" ? org.logo : org.cover_image}
                    orgId={orgId}
                    isOwn={isOwn}
                    onClose={() => setPhotoModal(null)}
                />
            )}

            {isEditModalOpen && (
                <EditOrgProfileModal
                    org={org}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
        </>
    )
}

// ── Public API ─────────────────────────────────────────────────────

interface OrgProfileProps {
    orgId: string
    isOwn?: boolean
}

export default function OrgProfile({ orgId, isOwn = false }: OrgProfileProps) {
    const { data: org, isLoading, isError } = useOrgDetail(orgId)

    if (isLoading) return <OrgProfileSkeleton />
    if (isError || !org) return <OrgProfileError />

    return <OrgProfileInner org={org} isOwn={isOwn} orgId={orgId} />
}