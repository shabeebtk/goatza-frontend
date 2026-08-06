// A profile's posts, open to anyone. A server component for the same reason
// the profile page is one: the anonymous list has to be fetched before render,
// because /posts/list is IsAuthenticated and PostsList must not fire it.

import type { Metadata } from "next"
import { notFound } from "next/navigation"

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

  // The profile resolves the 404 rules (hidden / inactive / usernameless); the
  // posts call is what the page actually renders. Both, because the posts
  // endpoint alone would say nothing about the profile's display name.
  const [bundle, posts] = await Promise.all([
    getPublicUserProfile(username),
    getPublicUserPosts(username),
  ])

  if (!bundle || !posts) notFound()

  return (
    <PublicPostsView
      username={username}
      kind="user"
      displayName={bundle.profile.name}
      posts={posts}
    />
  )
}
