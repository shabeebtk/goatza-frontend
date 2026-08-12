import { useAuthStore } from "@/store/auth.store"

type ProfileAuthorType = "user" | "organization"

/** The three explore "view all" listings, shared by user + org contexts. */
type ExploreListKind = "players" | "organizations" | "academies"

export function useNavigation() {
  const isOrgAdminView = useAuthStore((s) => s.isOrgAdminView)
  const currentOrg = useAuthStore((s) => s.currentOrganization)

  function toProfile(username: string, authorType: ProfileAuthorType = "user") {
    // admin context: always stay inside admin routes
    if (isOrgAdminView && currentOrg) {
      if (authorType === "organization") {
        // current org profile
        if (currentOrg.username === username) {
          return `/organization/admin/${currentOrg.id}/profile`
        }
        // other org profile inside admin
        return `/organization/admin/${currentOrg.id}/profile/org/${username}`
      }

      // user profile inside org admin
      return `/organization/admin/${currentOrg.id}/profile/user/${username}`
    }

    // public routes and user routes
    if (authorType === "organization") {
      return `/organization/profile/${username}`
    }

    return `/profile/${username}`
  }

  function toPost(postId: string, authorType: ProfileAuthorType = "user") {
    if (isOrgAdminView && currentOrg && authorType === "organization") {
      return `/organization/admin/${currentOrg.id}/posts/${postId}`
    }

    // Plural — /post/<id> is not a route and 404s.
    return `/posts/${postId}`
  }

  function toPostsList(username: string, authorType: ProfileAuthorType = "user") {
    if (isOrgAdminView && currentOrg) {
      if (authorType === "organization") {
        if (currentOrg.username === username) {
          return `/organization/admin/${currentOrg.id}/posts`
        }
        return `/organization/admin/${currentOrg.id}/profile/org/${username}/posts`
      }

      return `/organization/admin/${currentOrg.id}/profile/user/${username}/posts`
    }

    if (authorType === "organization") {
      return `/organization/profile/${username}/posts`
    }

    return `/profile/${username}/posts`
  }

  function toNetwork(
    username: string,
    authorType: ProfileAuthorType = "user",
    tab: "followers" | "following" | "connections" = "followers"
  ) {
    const query = `?tab=${tab}`

    // admin context: keep links inside the admin route space
    if (isOrgAdminView && currentOrg) {
      if (authorType === "organization") {
        return `/organization/admin/${currentOrg.id}/profile/org/${username}/network${query}`
      }
      return `/organization/admin/${currentOrg.id}/profile/user/${username}/network${query}`
    }

    if (authorType === "organization") {
      return `/organization/profile/${username}/network${query}`
    }

    return `/profile/${username}/network${query}`
  }

  function toMessage(username: string) {
    if (isOrgAdminView && currentOrg) {
      return `/organization/admin/${currentOrg.id}/messages/${username}`
    }
    return `/messages/${username}`
  }

  // Discovery (explore + search) stays inside the active actor's route space so
  // opening search / "see all" from an org never flips back to the personal
  // account. `query` is optional and encoded here when present.
  function toSearch(query?: string) {
    const base =
      isOrgAdminView && currentOrg
        ? `/organization/admin/${currentOrg.id}/search`
        : "/search"
    const trimmed = query?.trim()
    return trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base
  }

  function toExploreList(kind: ExploreListKind, query?: string) {
    const base =
      isOrgAdminView && currentOrg
        ? `/organization/admin/${currentOrg.id}/explore/${kind}`
        : `/explore/${kind}`
    const trimmed = query?.trim()
    return trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base
  }

  function toRecruitment(recruitmentId: string) {
    // admin context: stay inside admin routes so the active actor isn't reset
    if (isOrgAdminView && currentOrg) {
      return `/organization/admin/${currentOrg.id}/recruitments/${recruitmentId}`
    }

    return `/recruitments/${recruitmentId}`
  }

  function toCareerVerifications() {
    // Reviewing career claims is an org-admin action; there is no personal
    // equivalent. Outside the admin space this returns the org's dashboard
    // rather than a dead link — the caller shouldn't be linking here at all.
    if (isOrgAdminView && currentOrg) {
      return `/organization/admin/${currentOrg.id}/verifications`
    }

    return currentOrg
      ? `/organization/admin/${currentOrg.id}/verifications`
      : "/home"
  }

  /**
   * The same review page as careers, on its Achievements tab — there is one
   * verifications route with a domain tab, not two routes. The `tab` param is
   * what OrgVerificationsPage reads to open on the right side.
   */
  function toAchievementVerifications() {
    const base = toCareerVerifications()
    return base === "/home" ? base : `${base}?tab=achievements`
  }

  function toHighlightsManage() {
    // Highlights are personal to a player, so this never has an admin variant —
    // an org actor landing here is shown the "switch account" state instead.
    return "/highlights/manage"
  }

  function toRecruitmentsList(username: string) {
    // recruitments belong to organizations; keep the org's own list inside admin
    if (isOrgAdminView && currentOrg && currentOrg.username === username) {
      return `/organization/admin/${currentOrg.id}/recruitments`
    }

    return `/organization/profile/${username}/recruitments`
  }

  return {
    toProfile,
    toPost,
    toPostsList,
    toNetwork,
    toMessage,
    toSearch,
    toExploreList,
    toRecruitment,
    toRecruitmentsList,
    toCareerVerifications,
    toAchievementVerifications,
    toHighlightsManage,
  }
}