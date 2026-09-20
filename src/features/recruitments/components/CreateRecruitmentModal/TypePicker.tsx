"use client"

import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import type { RecruitmentType } from "./draft"
import type { Recruitment } from "../../services/recruitments.api"
import { TYPE_CONFIG, TYPE_ORDER } from "./typeConfig"
import { RECRUITMENT_TEMPLATES, type RecruitmentTemplate } from "./templates"
import styles from "./CreateRecruitmentModal.module.css"

/**
 * Screen 0 — what kind of recruitment is this?
 *
 * Four cards rather than a dropdown: the choice relabels the dates and hides
 * fields further in, so it deserves a sentence each, not a row of words.
 * Picking one enters the wizard. Edit mode never shows this screen.
 *
 * Above the cards, a faster start: the org's last five recruitments to
 * repeat, or — for an org with none — four seed templates. Either way the
 * user lands in the normal wizard with the fields filled; nothing is sent.
 */
export default function TypePicker({ onPick, onClone, onTemplate, past, pastLoading, cloning, disabled }: {
    onPick: (type: RecruitmentType) => void
    onClone: (recruitment: Recruitment) => void
    onTemplate: (template: RecruitmentTemplate) => void
    /** The org's newest recruitments, newest first; undefined while loading. */
    past?: Recruitment[]
    pastLoading?: boolean
    /** The id whose detail is being fetched for a clone, if any. */
    cloning?: string | null
    disabled?: boolean
}) {
    const hasHistory = (past?.length ?? 0) > 0

    return (
        <div className={styles.stepContent}>
            {!pastLoading && (
                <div className={styles.quickStart}>
                    <p className={styles.quickStartTitle}>
                        <Icon icon={hasHistory ? "mdi:history" : "mdi:lightning-bolt-outline"} width={14} height={14} />
                        {hasHistory ? "Repeat a past recruitment" : "Start from a template"}
                    </p>
                    <div className={styles.quickStartList}>
                        {hasHistory
                            ? past!.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className={styles.quickStartRow}
                                    onClick={() => onClone(r)}
                                    disabled={disabled || cloning !== null && cloning !== undefined}
                                >
                                    <span className={styles.quickStartIcon}>
                                        <Icon icon={cloning === r.id ? "mdi:loading" : (TYPE_CONFIG[r.recruitment_type]?.icon ?? "mdi:whistle-outline")} width={18} height={18} className={cloning === r.id ? styles.spin : undefined} />
                                    </span>
                                    <span className={styles.quickStartText}>
                                        <span className={styles.quickStartLabel}>{r.title}</span>
                                        <span className={styles.quickStartSub}>
                                            {[
                                                TYPE_CONFIG[r.recruitment_type]?.label,
                                                r.event_date ? dayjs(r.event_date).format("D MMM YYYY") : null,
                                                r.city || null,
                                            ].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                    <span className={styles.quickStartCta}>Repeat</span>
                                </button>
                            ))
                            : RECRUITMENT_TEMPLATES.map(t => (
                                <button
                                    key={t.key}
                                    type="button"
                                    className={styles.quickStartRow}
                                    onClick={() => onTemplate(t)}
                                    disabled={disabled}
                                >
                                    <span className={styles.quickStartIcon}>
                                        <Icon icon={t.icon} width={18} height={18} />
                                    </span>
                                    <span className={styles.quickStartText}>
                                        <span className={styles.quickStartLabel}>{t.label}</span>
                                        <span className={styles.quickStartSub}>{t.blurb}</span>
                                    </span>
                                    <span className={styles.quickStartCta}>Use</span>
                                </button>
                            ))}
                    </div>
                </div>
            )}

            <div className={styles.typePickerIntro}>
                <h3 className={styles.typePickerTitle}>{hasHistory || pastLoading ? "Or start fresh" : "What are you posting?"}</h3>
                <p className={styles.fieldSubLabel}>Pick the closest match — it just sets the labels and which fields you see.</p>
            </div>

            <div className={styles.typeGrid} role="list">
                {TYPE_ORDER.map(type => {
                    const cfg = TYPE_CONFIG[type]
                    return (
                        <button
                            key={type}
                            type="button"
                            role="listitem"
                            className={styles.typeCard}
                            onClick={() => onPick(type)}
                            disabled={disabled}
                        >
                            <span className={styles.typeCardIcon}>
                                <Icon icon={cfg.icon} width={22} height={22} />
                            </span>
                            <span className={styles.typeCardBody}>
                                <span className={styles.typeCardLabel}>{cfg.label}</span>
                                <span className={styles.typeCardBlurb}>{cfg.blurb}</span>
                            </span>
                            <Icon icon="mdi:chevron-right" width={18} height={18} className={styles.typeCardChevron} />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
