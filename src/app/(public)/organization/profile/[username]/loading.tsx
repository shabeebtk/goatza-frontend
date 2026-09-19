import ProfileSkeleton from "@/features/profile/components/ProfileSkeleton/ProfileSkeleton"

/**
 * What the organization profile segment shows while its server component is
 * still awaiting the Django bundle. Same fetch shape as the user profile, so
 * the same fallback for the same reasons — see the user twin's loading.tsx.
 * Covers /organization/profile/<username>/posts, /network and /recruitments
 * on the way in as well.
 */
export default function Loading() {
  return <ProfileSkeleton />
}
