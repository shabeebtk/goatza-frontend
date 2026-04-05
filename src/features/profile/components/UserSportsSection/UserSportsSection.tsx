"use client"

/**
 * UserSportsSection
 *
 * Drop this into UserProfile between the About section and the end.
 *
 * isOwn = true  → shows "Add Sport" button + edit/delete per card
 * isOwn = false → read-only display
 *
 * The component fetches its own data so UserProfile doesn't need to know about sports.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import {
  useMyUserSports,
  useUserSportsByUsername,
  useSportsList,
  useDeleteUserSport,
} from "@/features/profile/hooks/useSportsQueries"
import type { UserSport, Sport } from "@/features/profile/services/sports.api"
import SportEditModal from "@/features/profile/components/UserSportsEditModal/UserSportsEditModal"
import styles from "./UserSportsSection.module.css"

// ── Helpers ───────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
  professional: "Professional",
}

// ── Sport card ────────────────────────────────────────────────

interface SportCardProps {
  userSport: UserSport
  masterSport?: Sport             // needed to open edit modal
  isOwn: boolean
  onEdit: (userSport: UserSport, masterSport: Sport) => void
  onDelete: (id: string) => void
  deleting: boolean
}

function SportCard({
  userSport, masterSport, isOwn, onEdit, onDelete, deleting,
}: SportCardProps) {
  const primaryPos = userSport.positions.find((p) => p.is_primary)
  const otherPos   = userSport.positions.filter((p) => !p.is_primary)

  return (
    <div className={`${styles.sportCard} ${userSport.is_primary ? styles.sportCardPrimary : ""}`}>

      {/* Top row: icon + sport name + actions */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.sportIconWrap} aria-hidden="true">
            <Icon icon={userSport.sport.icon_name} width={24} height={24} />
          </span>
          <div>
            <div className={styles.sportName}>{userSport.sport.name}</div>
            {userSport.is_primary && (
              <span className={styles.primaryBadge}>
                <Icon icon="mdi:star" width={10} height={10} />
                Primary
              </span>
            )}
          </div>
        </div>

        {isOwn && (
          <div className={styles.cardActions}>
            <button
              className={styles.cardActionBtn}
              onClick={() => masterSport && onEdit(userSport, masterSport)}
              aria-label={`Edit ${userSport.sport.name}`}
              type="button"
            >
              <Icon icon="mdi:pencil-outline" width={15} height={15} />
            </button>
            <button
              className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`}
              onClick={() => onDelete(userSport.id)}
              aria-label={`Remove ${userSport.sport.name}`}
              type="button"
              disabled={deleting}
            >
              {deleting
                ? <span className={styles.miniSpinner} aria-hidden="true" />
                : <Icon icon="mdi:trash-can-outline" width={15} height={15} />}
            </button>
          </div>
        )}
      </div>

      {/* Level badge */}
      <div className={styles.cardMeta}>
        <span className={styles.levelBadge}>
          <Icon icon="mdi:signal-cellular-3" width={12} height={12} />
          {LEVEL_LABELS[userSport.experience_level] ?? userSport.experience_level}
        </span>
      </div>

      {/* Positions */}
      {userSport.positions.length > 0 && (
        <div className={styles.cardRow}>
          <p className={styles.cardRowLabel}>Positions</p>
          <div className={styles.tagRow}>
            {primaryPos && (
              <span className={`${styles.tag} ${styles.tagPrimary}`}>
                <Icon icon="mdi:star" width={10} height={10} />
                {primaryPos.position}
              </span>
            )}
            {otherPos.map((p) => (
              <span key={p.position} className={styles.tag}>{p.position}</span>
            ))}
          </div>
        </div>
      )}

      {/* Attributes */}
      {userSport.attributes.length > 0 && (
        <div className={styles.cardRow}>
          <p className={styles.cardRowLabel}>Attributes</p>
          <div className={styles.attrGrid}>
            {userSport.attributes.map((attr) => (
              <div key={attr.attribute} className={styles.attrItem}>
                <span className={styles.attrKey}>{attr.attribute}</span>
                <span className={styles.attrVal}>{attr.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Main component ────────────────────────────────────────────

interface UserSportsSectionProps {
  username: string
  isOwn: boolean
}

type ModalState =
  | { mode: "add"; sport: Sport }
  | { mode: "edit"; sport: Sport; userSport: UserSport }
  | null

export default function UserSportsSection({ username, isOwn }: UserSportsSectionProps) {
  // Fetch user sports — use own endpoint for isOwn, username endpoint for others
  const mySports       = useMyUserSports()
  const theirSports    = useUserSportsByUsername(username, !isOwn)
  const { data: masterSportsList } = useSportsList()
  const deleteSport    = useDeleteUserSport()

  const [modal, setModal]               = useState<ModalState>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [showSportPicker, setShowSportPicker] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: userSports, isLoading } = isOwn ? mySports : theirSports

  if (isLoading) {
    return (
      <div className={styles.skeleton}>
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCard} />
      </div>
    )
  }

  if (!userSports || (userSports.length === 0 && !isOwn)) return null

  // Sports the user hasn't added yet (for the picker)
  const addedSportIds  = new Set(userSports?.map((us) => us.sport.id) ?? [])
  const availableSports = masterSportsList?.filter((s) => !addedSportIds.has(s.id)) ?? []

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteSport.mutateAsync(id)
    } finally {
      setDeletingId(null)
      setDeleteConfirmId(null)
    }
  }

  const handleEdit = (userSport: UserSport, masterSport: Sport) => {
    setModal({ mode: "edit", sport: masterSport, userSport })
  }

  const handleAddClick = (sport: Sport) => {
    setShowSportPicker(false)
    setModal({ mode: "add", sport })
  }

  return (
    <>
      <div className={styles.section}>

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <Icon icon="mdi:trophy-outline" width={16} height={16} aria-hidden="true" />
            Sports
          </h2>
          {isOwn && (
            <button
              className={styles.addBtn}
              onClick={() => setShowSportPicker((v) => !v)}
              type="button"
              aria-label="Add sport"
              aria-expanded={showSportPicker}
            >
              <Icon icon="mdi:plus" width={16} height={16} />
              Add Sport
            </button>
          )}
        </div>

        {/* Sport picker dropdown */}
        {showSportPicker && isOwn && (
          <div className={styles.sportPicker}>
            {availableSports.length === 0 ? (
              <p className={styles.pickerEmpty}>You've added all available sports.</p>
            ) : (
              availableSports.map((sport) => (
                <button
                  key={sport.id}
                  className={styles.pickerItem}
                  onClick={() => handleAddClick(sport)}
                  type="button"
                >
                  <Icon icon={sport.icon_name} width={18} height={18} aria-hidden="true" />
                  {sport.name}
                  <Icon icon="mdi:chevron-right" width={15} height={15} className={styles.pickerChevron} />
                </button>
              ))
            )}
          </div>
        )}

        {/* Empty state for own profile */}
        {userSports.length === 0 && isOwn && (
          <div className={styles.emptyState}>
            <Icon icon="mdi:trophy-outline" width={36} height={36} />
            <p>Add your sports to help scouts find you</p>
          </div>
        )}

        {/* Sport cards */}
        {userSports.length > 0 && (
          <div className={styles.cardList}>
            {userSports.map((us) => {
              const master = masterSportsList?.find((s) => s.id === us.sport.id)
              const isDeleting = deletingId === us.id

              return (
                <div key={us.id}>
                  {deleteConfirmId === us.id ? (
                    <div className={styles.deleteConfirm}>
                      <p className={styles.deleteConfirmText}>
                        Remove <strong>{us.sport.name}</strong> from your profile?
                      </p>
                      <div className={styles.deleteConfirmActions}>
                        <button
                          className={styles.deleteConfirmCancel}
                          onClick={() => setDeleteConfirmId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className={styles.deleteConfirmOk}
                          onClick={() => handleDelete(us.sport.id)}
                          disabled={isDeleting}
                          type="button"
                        >
                          {isDeleting
                            ? <><span className={styles.miniSpinner} /> Removing…</>
                            : "Remove"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <SportCard
                      userSport={us}
                      masterSport={master}
                      isOwn={isOwn}
                      onEdit={handleEdit}
                      onDelete={(id) => setDeleteConfirmId(id)}
                      deleting={isDeleting}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Edit / Add modal */}
      {modal && (
        <SportEditModal
          sport={modal.sport}
          existing={modal.mode === "edit" ? modal.userSport : undefined}
          isPrimaryDisabled={
            modal.mode === "edit" &&
            modal.userSport.is_primary &&
            (userSports?.length ?? 0) === 1
          }
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}