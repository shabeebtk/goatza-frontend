// An organization's posts, open to anyone. Server component — same reasoning
// as the user twin.

import type { Metadata } from "next"

import PublicPostsView from "@/features/profile/components/PublicPostsView/PublicPostsView"
import {
  getPublicOrganizationPosts,
  getPublicOrganizationProfile,
} from "@/features/profile/services/publicProfile.api"

export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const bundle = await getPublicOrganizationProfile(username)

  if (!bundle) {
    return { title: "Posts · Goatza", robots: { index: false, follow: false } }
  }

  return {
    title: `Posts by ${bundle.profile.name} (@${bundle.profile.username}) · Goatza`,
    description: `Posts from ${bundle.profile.name} on Goatza`,
  }
}

export default async function PublicOrgPostsPage({ params }: Params) {
  const { username } = await params

  // Either may be null — no notFound(), same reasoning as the user twin.
  const [bundle, posts] = await Promise.all([
    getPublicOrganizationProfile(username),
    getPublicOrganizationPosts(username),
  ])

  return (
    <PublicPostsView
      username={username}
      kind="organization"
      displayName={bundle?.profile.name ?? username}
      posts={posts}
    />
  )
}
