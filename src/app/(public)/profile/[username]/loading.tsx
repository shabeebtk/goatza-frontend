import ProfileSkeleton from "@/features/profile/components/ProfileSkeleton/ProfileSkeleton"

/**
 * What the profile segment shows while its server component is still awaiting
 * the Django bundle.
 *
 * SEGMENT-LEVEL ON PURPOSE. There used to be one app/loading.tsx at the root,
 * and a root boundary swaps out the WHOLE tree — nav included — for a centred
 * logo on every navigation into a segment that is not ready. Sitting here,
 * inside (public)/layout.tsx, this fallback renders within PublicShell: the
 * nav stays mounted and only the content area shows the skeleton. Routes
 * without a loading file keep the previous page on screen until the next one
 * is ready, which is the behaviour every other route wants.
 *
 * No nav band: the shell above has already drawn the real nav. The same
 * silhouette is what UserProfile paints during its own authenticated fetch, so
 * the page arriving does not change shape — see ProfileSkeleton.
 *
 * Note that a loading file covers every child of its segment, so this is also
 * the fallback on the way to /profile/<username>/posts and /network.
 */
export default function Loading() {
  return <ProfileSkeleton />
}
