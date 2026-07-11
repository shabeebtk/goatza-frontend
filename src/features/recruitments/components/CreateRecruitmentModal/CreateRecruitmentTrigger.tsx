"use client"

import { useState } from "react"
import CreateRecruitmentModal from "./CreateRecruitmentModal"
import { useAuthStore } from "@/store/auth.store"
import { createPortal } from "react-dom"
import type { RecruitmentDetail } from "../../services/recruitments.api"

interface CreateRecruitmentTriggerProps {
    /** Render-prop trigger (uncontrolled usage). */
    children?: (open: () => void) => React.ReactNode
    onCreated?: (recruitmentId: string) => void
    /** Controlled open state — when provided, the modal is driven externally. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** "edit" opens the modal prefilled from initialRecruitment and PATCHes on save. */
    mode?: "create" | "edit"
    initialRecruitment?: RecruitmentDetail
    onUpdated?: (recruitmentId: string) => void
}

export default function CreateRecruitmentTrigger({
    children,
    onCreated,
    open: controlledOpen,
    onOpenChange,
    mode = "create",
    initialRecruitment,
    onUpdated,
}: CreateRecruitmentTriggerProps) {
    const [internalOpen, setInternalOpen] = useState(false)

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = (next: boolean) => {
        if (isControlled) onOpenChange?.(next)
        else setInternalOpen(next)
    }

    const user = useAuthStore(s => s.user)
    const currentOrg = useAuthStore(s => s.currentOrganization)
    const actorType = useAuthStore(s => s.actorType)

    // Only org actors can post recruitments
    if (!user || actorType !== "organization" || !currentOrg) return null

    return (
        <>
            {children?.(() => setOpen(true))}

            {open && createPortal(
                <CreateRecruitmentModal
                    username={user.username}
                    userAvatarUrl={user.profile_photo}
                    userInitials={user.name?.slice(0, 2).toUpperCase() ?? user.username.slice(0, 2).toUpperCase()}
                    displayName={currentOrg.name}
                    orgId={currentOrg.id}
                    mode={mode}
                    initialRecruitment={initialRecruitment}
                    onClose={() => setOpen(false)}
                    onCreated={(id) => {
                        setOpen(false)
                        onCreated?.(id)
                    }}
                    onUpdated={(id) => {
                        setOpen(false)
                        onUpdated?.(id)
                    }}
                />,
                document.body
            )}
        </>
    )
}