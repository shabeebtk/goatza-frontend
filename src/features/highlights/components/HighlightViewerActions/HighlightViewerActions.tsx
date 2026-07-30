"use client"

/**
 * Quick actions inside the viewer header (HIGHLIGHTS_SPEC.md §3).
 *
 * Profile and Message open in a NEW TAB on purpose: the whole point of the
 * recruiter surfaces is that the modal — and the recruiter's place in the
 * pipeline — survives. Anything pipeline-specific (shortlist / advance stage)
 * comes in as `children` from the recruitments feature, so this component stays
 * free of recruitment concerns.
 */

import { Icon } from "@iconify/react"

import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./HighlightViewerActions.module.css"

type HighlightViewerActionsProps = {
    username: string
    children?: React.ReactNode
}

export default function HighlightViewerActions({
    username,
    children,
}: HighlightViewerActionsProps) {
    const { toProfile, toMessage } = useNavigation()

    return (
        <>
            <a
                className={styles.action}
                href={toProfile(username, "user")}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Icon icon="mdi:account-outline" width={15} height={15} />
                Profile
            </a>

            <a
                className={styles.action}
                href={toMessage(username)}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Icon icon="mdi:message-outline" width={15} height={15} />
                Message
            </a>

            {children}
        </>
    )
}
