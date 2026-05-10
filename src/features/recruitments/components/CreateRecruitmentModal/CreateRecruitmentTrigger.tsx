"use client"

import { useState } from "react"
import CreateRecruitmentModal from "./CreateRecruitmentModal"
import { useAuthStore } from "@/store/auth.store"
import { createPortal } from "react-dom"

interface CreateRecruitmentTriggerProps {
    children: (open: () => void) => React.ReactNode
    onCreated?: (recruitmentId: string) => void
}

export default function CreateRecruitmentTrigger({
    children,
    onCreated,
}: CreateRecruitmentTriggerProps) {
    const [open, setOpen] = useState(false)

    const user = useAuthStore(s => s.user)
    const currentOrg = useAuthStore(s => s.currentOrganization)
    const actorType = useAuthStore(s => s.actorType)

    // Only org actors can post recruitments
    if (!user || actorType !== "organization" || !currentOrg) return null

    return (
        <>
            {children(() => setOpen(true))}

            {open && createPortal(
                <CreateRecruitmentModal
                    username={user.username}
                    userAvatarUrl={user.profile_photo}
                    userInitials={user.name?.slice(0, 2).toUpperCase() ?? user.username.slice(0, 2).toUpperCase()}
                    displayName={currentOrg.name}
                    orgId={currentOrg.id}
                    onClose={() => setOpen(false)}
                    onCreated={(id) => {
                        setOpen(false)
                        onCreated?.(id)
                    }}
                />,
                document.body
            )}
        </>
    )
}