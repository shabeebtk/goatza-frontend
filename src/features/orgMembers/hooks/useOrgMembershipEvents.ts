"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { ORG_MEMBERSHIP_CHANGED, realtimeBus, type RealtimePayload } from "@/core/ws/realtimeBus"
import { orgKeys } from "@/features/organization/hooks/useOrganizations"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useAuthStore } from "@/store/auth.store"
import { isLeaving } from "../leavingOrganizations"
import { orgMemberKeys } from "../services/orgMembers.api"

type MembershipEvent = RealtimePayload & {
  organization_id?: string
  status?: "removed" | "left" | "role_changed" | "active"
}

/**
 * The person's membership of an organization changed, somewhere else.
 *
 * Mounted by both shells, beside the socket. The same event comes from two places:
 * the server over ws/notifications/, and core/api/axios when a request acting as
 * the org answers "You are not part of this organization", which is what catches a
 * device whose socket missed it.
 *
 * ONCE: the store switches away from the org synchronously, first thing. Requests
 * still in flight then find the person is no longer acting as it, so axios stays
 * quiet and nothing here can repeat or loop.
 */
export function useOrgMembershipEvents() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    return realtimeBus.on<MembershipEvent>(ORG_MEMBERSHIP_CHANGED, (event) => {
      const organizationId = event.organization_id
      if (!organizationId) return

      if (event.status === "removed" || event.status === "left") {
        if (isLeaving(organizationId)) return

        const store = useAuthStore.getState()
        const wasActing = store.actorType === "organization" && store.actorId === organizationId
        const name =
          store.organizations.find((organization) => organization.id === organizationId)?.name ??
          "this organization"

        store.removeOrganization(organizationId)

        if (wasActing) {
          queryClient.clear()
          toast.show({
            title: `You're no longer a member of ${name}`,
            variant: "warning",
            position: "top-center",
            duration: 6000,
          })
          router.push("/home")
        } else {
          queryClient.invalidateQueries({ queryKey: orgKeys.list() })
        }
        return
      }

      // role_changed + active: the list is what carries my_role and
      // my_permissions, and ActorRouteSync puts a refetched list in the store.
      queryClient.invalidateQueries({ queryKey: orgKeys.all() })
      queryClient.invalidateQueries({ queryKey: orgMemberKeys.all() })
    })
  }, [queryClient, router, toast])
}
