// A profile's posts, open to anyone. A server component for the same reason
// the profile page is one: the anonymous list has to be fetched before render,
// because /posts/list is IsAuthenticated and PostsList must not fire it.

import type { Metadata } from "next"

import PublicPostsView from "@/features/profile/components/PublicPostsView/PublicPostsView"
import {
  getPublicUserPosts,
  getPublicUserProfile,
} from "@/features/profile/services/publicProfile.api"

export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const bundle = await getPublicUserProfile(username)

  if (!bundle) {
    return { title: "Posts · Goatza", robots: { index: false, follow: false } }
  }

  return {
    title: `Posts by ${bundle.profile.name} (@${bundle.profile.username}) · Goatza`,
    description: `Posts from ${bundle.profile.name} on Goatza`,
  }
}

export default async function PublicUserPostsPage({ params }: Params) {
  const { username } = await params

  // The profile carries the display name for the wall's copy; the posts call is
  // what the page renders. Either may be null — no notFound(), for the same
  // reason as the profile page: a signed-in visitor is entitled to posts the
  // public payload refuses, and PublicPostsView falls back to the authenticated
  // list for them.
  const [bundle, posts] = await Promise.all([
    getPublicUserProfile(username),
    getPublicUserPosts(username),
  ])

  return (
    <PublicPostsView
      username={username}
      kind="user"
      displayName={bundle?.profile.name ?? username}
      posts={posts}
    />
  )
}
