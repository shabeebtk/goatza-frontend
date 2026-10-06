"use client"

/**
 * /applications/[applicationId]/pass
 *
 * The player's own trial pass. Reached from My applications and from the
 * recruitment page once the org has confirmed them, and linked directly from
 * the evening-before reminder — at 6pm the night before, the pass is the one
 * thing they actually need.
 *
 * The API is the authority on who may see this: it answers 404 for anybody
 * but the applicant and 409 before they are confirmed. Both are ANSWERS, not
 * errors, so they render as their own states rather than a generic failure.
 */

import { use } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import TrialPass from "@/features/recruitments/components/TrialPass/TrialPass"
import { useTrialPass } from "@/features/recruitments/hooks/useAnnouncements"

export default function TrialPassPage({
    params,
}: {
    params: Promise<{ applicationId: string }>
}) {
    const { applicationId } = use(params)
    const { data: pass, isLoading, error } = useTrialPass(applicationId)

    if (isLoading) {
        return (
            <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
                <Icon icon="mdi:loading" width={24} height={24} className="spin" />
            </div>
        )
    }

    if (error || !pass) {
        // Deliberately one state for "not yours" and "not confirmed yet". The
        // API keeps them apart in its status code; the page does not need to,
        // and collapsing them means a wrong id never confirms it is real.
        return (
            <div
                style={{
                    maxWidth: 420,
                    margin: "0 auto",
                    padding: "var(--space-6) var(--space-4)",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                    alignItems: "center",
                }}
            >
                <Icon
                    icon="mdi:card-account-details-outline"
                    width={40}
                    height={40}
                    style={{ color: "var(--color-text-muted)" }}
                />
                <h1 style={{ margin: 0, fontSize: "var(--text-base)" }}>
                    No pass yet
                </h1>
                <p
                    style={{
                        margin: 0,
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-muted)",
                    }}
                >
                    Your pass appears here once the organization confirms you for
                    the trial.
                </p>
                <Link
                    href="/recruitments/applications"
                    style={{ fontSize: "var(--text-sm)", color: "var(--color-brand)" }}
                >
                    My applications
                </Link>
            </div>
        )
    }

    return <TrialPass pass={pass} />
}
