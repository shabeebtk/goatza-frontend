"use client"

/**
 * CareerAddPromptSheet
 *
 * Opened from the `career_add_prompt` notification a player gets when an
 * organization selects them. Confirms turning that result into a career entry.
 *
 * Almost everything is derived server-side from the recruitment — organization,
 * sport, positions, entry type, and the verified status the entry lands with.
 * The summary here mirrors that so the player can see what they are agreeing
 * to; only title, start date and description are editable, matching the three
 * overrides the API accepts.
 *
 * The call is idempotent: a second POST returns the existing entry with 200
 * rather than erroring. That is treated as success ("already on your career"),
 * because from the player's side it is.
 */

import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import { useRecruitmentDetail } from "@/features/recruitments/hooks/useRecruitments"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Portal from "@/shared/components/ui/Portal/Portal"
import { organizationInitials } from "../../careerMeta"
import { toCalendarDate } from "../../utils/careerDates"
import { useAddCareerFromApplication } from "../../hooks/useCareerQueries"
import styles from "./CareerAddPromptSheet.module.css"

const DESCRIPTION_LIMIT = 500

interface CareerAddPromptSheetProps {
    applicationId: string
    recruitmentId?: string
    /** Falls back to the recruitment's own organization once that loads. */
    organizationName?: string
    organizationLogo?: string
    onClose: () => void
}

export default function CareerAddPromptSheet({
    applicationId,
    recruitmentId,
    organizationName,
    organizationLogo,
    onClose,
}: CareerAddPromptSheetProps) {
    const { data: recruitment, isLoading } = useRecruitmentDetail(
        recruitmentId ?? ""
    )
    const addFromApplication = useAddCareerFromApplication()

    const [title, setTitle] = useState("Player")
    // Prefilled from the trial/event date when the org published one. Left
    // blank otherwise so the SERVER picks — it knows the date the application
    // was actually marked selected, which the client cannot see.
    const [startDate, setStartDate] = useState(() => "")
    const [description, setDescription] = useState("")
    const [prefilled, setPrefilled] = useState(false)

    // Same lock the career modal uses — without it the notifications list
    // scrolls behind the sheet on mobile.
    useEffect(() => {
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = ""
        }
    }, [])

    // One-shot prefill once the recruitment lands. Not an effect: this runs
    // during render off data that is already here, and the guard makes it
    // idempotent so it can never fight the user's own edit.
    if (!prefilled && recruitment) {
        setPrefilled(true)
        if (recruitment.event_date) {
            setStartDate(toCalendarDate(recruitment.event_date))
        }
    }

    const orgName =
        recruitment?.organization?.name ?? organizationName ?? "the club"
    const orgLogo = recruitment?.organization?.logo ?? organizationLogo

    const positions = recruitment?.positions ?? []

    const handleSubmit = async () => {
        try {
            const { created } = await addFromApplication.mutateAsync({
                applicationId,
                payload: {
                    title: title.trim() || undefined,
                    start_date: startDate || undefined,
                    description: description.trim() || undefined,
                },
            })

            toast.success(
                created
                    ? "🎉 Added to your career — verified"
                    : "This is already on your career"
            )
            onClose()
        } catch {
            // useAddCareerFromApplication already surfaces the server's message;
            // the sheet stays open so nothing typed is lost.
        }
    }

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !addFromApplication.isPending) {
            onClose()
        }
    }

    return (
        // Portalled for the same reason as CareerEntryModal — a transformed
        // ancestor would trap this fixed backdrop inside the page.
        <Portal>
            <div
                className={styles.backdrop}
                onClick={handleBackdrop}
                role="dialog"
                aria-modal="true"
                aria-label="Add this to your career"
            >
                <div className={styles.sheet}>
                <div className={styles.header}>
                    <span className={styles.grabber} aria-hidden="true" />
                    <button
                        className={styles.closeBtn}
                        onClick={onClose}
                        type="button"
                        aria-label="Close"
                        disabled={addFromApplication.isPending}
                    >
                        <Icon icon="mdi:close" width={20} height={20} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.hero}>
                        <Avatar
                            src={orgLogo || undefined}
                            initials={organizationInitials(orgName)}
                            alt={orgName}
                            size="lg"
                            className={styles.heroAvatar}
                        />
                        <h2 className={styles.heroTitle}>
                            You were selected by {orgName}
                        </h2>
                        <p className={styles.heroText}>
                            Add this to your career? It will appear on your profile
                            already verified — it came from {orgName}&apos;s own
                            selection.
                        </p>
                    </div>

                    {/* ── Derived summary ── */}
                    <div className={styles.summary}>
                        {isLoading && recruitmentId ? (
                            <p className={styles.summaryLoading}>
                                <span className={styles.miniSpinner} aria-hidden="true" />
                                Loading details…
                            </p>
                        ) : (
                            <>
                                <div className={styles.summaryRow}>
                                    <span className={styles.summaryKey}>Club</span>
                                    <span className={styles.summaryVal}>{orgName}</span>
                                </div>
                                {recruitment?.sport && (
                                    <div className={styles.summaryRow}>
                                        <span className={styles.summaryKey}>Sport</span>
                                        <span className={styles.summaryVal}>
                                            {recruitment.sport.name}
                                        </span>
                                    </div>
                                )}
                                {positions.length > 0 && (
                                    <div className={styles.summaryRow}>
                                        <span className={styles.summaryKey}>Position</span>
                                        <span className={styles.summaryVal}>
                                            {positions
                                                .map((p) => p.position.name)
                                                .join(", ")}
                                        </span>
                                    </div>
                                )}
                                {recruitment?.title && (
                                    <div className={styles.summaryRow}>
                                        <span className={styles.summaryKey}>From</span>
                                        <span className={styles.summaryVal}>
                                            {recruitment.title}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Editable ── */}
                    <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor="career-prompt-title">
                            Title
                        </label>
                        <input
                            id="career-prompt-title"
                            className={styles.input}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            placeholder="Player"
                            disabled={addFromApplication.isPending}
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor="career-prompt-start">
                            Start date
                        </label>
                        <input
                            id="career-prompt-start"
                            type="date"
                            className={styles.input}
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={addFromApplication.isPending}
                        />
                        <p className={styles.fieldHint}>
                            {startDate
                                ? "From the trial date — change it if you started later."
                                : "Leave blank to use the date you were selected."}
                        </p>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor="career-prompt-desc">
                            Description
                        </label>
                        <textarea
                            id="career-prompt-desc"
                            className={`${styles.input} ${styles.textarea}`}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            maxLength={DESCRIPTION_LIMIT}
                            placeholder="Optional — anything worth remembering."
                            disabled={addFromApplication.isPending}
                        />
                        <p className={styles.fieldHint}>
                            {description.length}/{DESCRIPTION_LIMIT}
                        </p>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={onClose}
                        disabled={addFromApplication.isPending}
                    >
                        Not now
                    </button>
                    <button
                        type="button"
                        className={styles.confirmBtn}
                        onClick={handleSubmit}
                        disabled={addFromApplication.isPending}
                    >
                        {addFromApplication.isPending ? (
                            <>
                                <span className={styles.miniSpinner} aria-hidden="true" />
                                Adding…
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:plus" width={16} height={16} />
                                Add to career
                            </>
                        )}
                    </button>
                    </div>
                </div>
            </div>
        </Portal>
    )
}
