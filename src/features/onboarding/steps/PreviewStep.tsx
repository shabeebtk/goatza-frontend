"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { Button } from "@/shared/components/ui"
import PhotoEditModal from "@/features/profile/components/PhotoEditModal/PhotoEditModal"
import { useMyProfile } from "@/features/profile/hooks/useProfileQueries"
import { useOnboardingStore } from "../store/onboarding.store"
import { useCompleteOnboarding } from "../hooks/useCompleteOnboarding"
import ProfilePreviewCard from "../components/ProfilePreviewCard"
import modal from "../components/OnboardingModal.module.css"
import styles from "./PreviewStep.module.css"

type PhotoType = "profile" | "cover" | null

/**
 * Step 5 — Preview + photos. Shows a compact, faithful preview of the profile
 * fed with freshly-refetched persisted data (not local state), lets the user set
 * their avatar/cover via the existing photo editor, then completes onboarding.
 */
export default function PreviewStep({ onNext }: { onNext: () => void }) {
  const { data: profile, isLoading, refetch: refetchProfile } = useMyProfile()

  const setNestedOpen = useOnboardingStore((s) => s.setNestedOpen)
  const completeOnboarding = useCompleteOnboarding()

  const [photoModal, setPhotoModal] = useState<PhotoType>(null)
  const [mounted, setMounted] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Refetch persisted truth after the prior steps' saves (the sport upsert, in
  // particular, doesn't sync into the profile cache).
  useEffect(() => {
    setMounted(true)
    // /user/details recomputes primary_sport server-side, so this reflects the
    // sport just saved (the sport upsert doesn't sync into the profile cache).
    refetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPhoto = (type: "profile" | "cover") => {
    setPhotoModal(type)
    setNestedOpen(true)
  }
  const closePhoto = () => {
    setPhotoModal(null)
    setNestedOpen(false)
  }

  const handleComplete = async () => {
    setApiError(null)
    try {
      await completeOnboarding.mutateAsync()
      onNext()
    } catch {
      setApiError("Couldn't complete your profile. Please try again.")
    }
  }

  if (isLoading || !profile) {
    return (
      <div className={modal.stepScaffold}>
        <div className={`${modal.stepBody} ${styles.loadingBody}`}>
          <span className={styles.miniSpinner} aria-hidden="true" />
          <span className={styles.loadingText}>Building your preview…</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Compact layout (no big scaffold intro) so the whole card — details and the
          action buttons at the bottom — fits the desktop modal without scrolling. */}
      <div className={modal.stepScaffold}>
        <div className={`${modal.stepBody} ${styles.previewBody}`}>
          <p className={styles.previewHint}>
            Here's how your profile will look. Tap a photo to add one.
          </p>

          <ProfilePreviewCard profile={profile} onEditPhoto={openPhoto} />

          {apiError && (
            <p className={modal.apiError} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
              {apiError}
            </p>
          )}
        </div>

        <div className={modal.stepFooter}>
          <Button
            variant="brand"
            size="lg"
            fullWidth
            loading={completeOnboarding.isPending}
            onClick={handleComplete}
          >
            Complete my profile →
          </Button>
        </div>
      </div>

      {/* Photo editor: portaled to body + lifted above the onboarding layer, so the
          onboarding modal's transform doesn't trap its position:fixed. */}
      {mounted &&
        photoModal &&
        createPortal(
          <div className={styles.photoPortal}>
            <PhotoEditModal
              type={photoModal}
              currentSrc={photoModal === "profile" ? profile.profile_photo : profile.cover_photo}
              username={profile.username}
              isOwn
              onClose={closePhoto}
            />
          </div>,
          document.body
        )}
    </>
  )
}
