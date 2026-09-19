import { CVSkeleton } from "@/features/profile/components/ProfileSkeleton/ProfileSkeleton"

/**
 * What the CV segment shows while its server component is still awaiting the
 * Django bundle. Same reasoning as the profile's loading.tsx: a boundary here
 * renders inside PublicShell with the nav still mounted, and it is the same
 * silhouette PublicShell draws while the auth store resolves — minus the nav
 * band, which the real shell already provides.
 */
export default function Loading() {
  return <CVSkeleton />
}
