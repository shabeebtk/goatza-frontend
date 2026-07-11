"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Icon } from "@iconify/react"
import Button from "@/shared/components/ui/Button/Button"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  followUserApi,
  unfollowUserApi,
} from "@/features/profile/services/profile.api"
import {
  followOrganizationApi,
  unfollowOrganizationApi,
} from "@/features/organization/services/organization.api"

type FollowTargetType = "user" | "organization"

interface FollowButtonProps {
  targetId: string
  targetType: FollowTargetType
  /** Only used for the accessible label / error copy. */
  name?: string
  initialFollowing?: boolean
  fullWidth?: boolean
  size?: "sm" | "md"
}

/**
 * Optimistic follow / unfollow toggle. Flips instantly on click, then fires the
 * API in the background and rolls back on failure. Deliberately does NOT do a
 * follow-back lookup (only "follow" / "following") — that check is expensive at
 * scale and unnecessary here. Holds its own local state, so it never refetches
 * or reshuffles the list it lives in.
 */
export default function FollowButton({
  targetId,
  targetType,
  name,
  initialFollowing = false,
  fullWidth = false,
  size = "sm",
}: FollowButtonProps) {
  const toast = useToast()
  const [following, setFollowing] = useState(initialFollowing)

  const mutation = useMutation({
    mutationFn: (next: boolean) => {
      if (targetType === "organization") {
        const payload = { target_type: "organization" as const, target_id: targetId }
        return next
          ? followOrganizationApi(payload)
          : unfollowOrganizationApi(payload)
      }
      const payload = { target_type: "user" as const, target_id: targetId }
      return next ? followUserApi(payload) : unfollowUserApi(payload)
    },
    onError: (_err, next) => {
      // Undo the optimistic flip and let the user know.
      setFollowing(!next)
      toast.show({
        title: "Something went wrong",
        message: `Couldn't ${next ? "follow" : "unfollow"}${name ? ` ${name}` : ""}. Please try again.`,
        variant: "error",
      })
    },
  })

  const handleClick = () => {
    // Ignore taps while a request is in flight to avoid follow/unfollow races.
    if (mutation.isPending) return
    const next = !following
    setFollowing(next) // instant UI response…
    mutation.mutate(next) // …then the network call
  }

  const label = following
    ? `Unfollow${name ? ` ${name}` : ""}`
    : `Follow${name ? ` ${name}` : ""}`

  return (
    <Button
      type="button"
      variant={following ? "outline" : "brand"}
      size={size}
      fullWidth={fullWidth}
      onClick={handleClick}
      aria-label={label}
      leftIcon={
        <Icon icon={following ? "mdi:check" : "mdi:plus"} width={14} height={14} />
      }
    >
      {following ? "Following" : "Follow"}
    </Button>
  )
}
