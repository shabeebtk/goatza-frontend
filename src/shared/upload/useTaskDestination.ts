"use client"

/**
 * Where a task's "View" goes.
 *
 * The composer's own answer when it gave one. A task restored after a reload
 * has none (no composer made it), so it is worked out here from the active
 * account — which is its account, because only those tasks are ever shown.
 */

import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import type { QueueTask, QueueTaskDestination } from "@/store/uploadQueue.store"

export function useTaskDestination(task: QueueTask): QueueTaskDestination | null {
    const { toPostsList, toProfile } = useNavigation()
    const username = useAuthStore((s) => s.user?.username)
    const actingAsOrg = useAuthStore((s) => s.actorType === "organization")
    const orgUsername = useAuthStore((s) => s.currentOrganization?.username)

    if (task.destination) return task.destination

    if (task.kind === "highlight") {
        return username ? { href: toProfile(username), kind: "profile" } : null
    }
    if (actingAsOrg) {
        return orgUsername
            ? { href: toPostsList(orgUsername, "organization"), kind: "posts" }
            : null
    }
    return username ? { href: toPostsList(username, "user"), kind: "posts" } : null
}
