import { useAuthStore } from "@/store/auth.store"

type ProfileAuthorType = "user" | "organization"

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

    return `/post/${postId}`
  }

  function toPostsList(username: string, authorType: ProfileAuthorType = "user") {
    if (isOrgAdminView && currentOrg) {
      if (authorType === "organization") {
        if (currentOrg.username === username) {
          return `/organization/admin/${currentOrg.id}/posts`
        }
        return `/organization/admin/${currentOrg.id}/profile/organization/${username}/posts`
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

  function toRecruitment(recruitmentId: string) {
    // admin context: stay inside admin routes so the active actor isn't reset
    if (isOrgAdminView && currentOrg) {
      return `/organization/admin/${currentOrg.id}/recruitments/${recruitmentId}`
    }

    return `/recruitments/${recruitmentId}`
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
    toRecruitment,
    toRecruitmentsList,
  }
}