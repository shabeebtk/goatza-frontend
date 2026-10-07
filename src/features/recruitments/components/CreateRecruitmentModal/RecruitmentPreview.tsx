"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import MarkdownLite from "../MarkdownLite/MarkdownLite"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import { formatBirthYears, formatReportingTime } from "../../eligibility"
import {
    APPLY_METHOD_LABEL,
    BENEFIT_ICONS,
    GENDER_LABEL,
} from "../../recruitmentCopy"
import type { PreviewRecruitment } from "./draftToPreviewRecruitment"
import styles from "./RecruitmentPreview.module.css"

/**
 * What the listing will look like — the real card plus a detail-style block,
 * built from the draft. Every empty field is a PROMPT, not a blank: a grey
 * "Add a photo" band, "Add a location" in the meta row. That is the point of
 * showing it: the cost of skipping a field is visible instead of described.
 *
 * Tapping a prompt jumps the wizard to the field (`onJump`). The card itself
 * is inert — its links and bookmark are the real ones and would navigate.
 *
 * The hero band pages through the WHOLE uploaded set. The card below it shows
 * only the cover, because that is all a player's card ever shows; this is the
 * one place the org gets to check the rest of what it just uploaded.
 */
export type PreviewJumpTarget =
    | "photos" | "date" | "location" | "description" | "contact" | "tagline" | "deadline" | "title"

export default function RecruitmentPreview({ recruitment: r, dateLabel, onJump, compact = false }: {
    recruitment: PreviewRecruitment
    /** "Trial date" from the type config; null for a type with no trial day,
     *  which drops the date line rather than prompting for a hidden field. */
    dateLabel: string | null
    onJump?: (target: PreviewJumpTarget) => void
    /** The live side/strip preview: tighter spacing. The hero keeps the real
     *  4:5 poster frame in both modes — see the CSS. */
    compact?: boolean
}) {
    const prompt = (target: PreviewJumpTarget, label: string, icon = "mdi:plus-circle-outline") => (
        <button
            type="button"
            className={styles.prompt}
            onClick={onJump ? () => onJump(target) : undefined}
            disabled={!onJump}
        >
            <Icon icon={icon} width={13} height={13} />
            {label}
        </button>
    )

    // Which photo the hero band is showing. Clamped during render rather
    // than corrected in an effect: the wizard's media list shrinks the
    // moment the org removes a photo on the previous step, and an index
    // past the end would paint one broken frame before any effect ran.
    const [rawShot, setShot] = useState(0)
    const shots = r.media_previews
    const shot = shots.length > 0 ? Math.min(rawShot, shots.length - 1) : 0
    const hero = shots[shot]
    const date = r.event_date ? dayjs(r.event_date).format("ddd, D MMM YYYY") : null
    const deadline = r.application_deadline ? dayjs(r.application_deadline).format("D MMM") : null
    const contacts = r.contacts
    const fee = r.is_paid
        ? (r.fee_amount ? `${r.fee_currency || "INR"} ${r.fee_amount}` : "Paid")
        : "Free"

    return (
        <div className={`${styles.preview} ${compact ? styles.previewCompact : ""}`} data-preview>
            {/* ── Hero band ── */}
            {hero ? (
                <div className={styles.hero}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL / media-domain URL, no loader */}
                    <img src={hero} alt="" className={styles.heroImg} />
                    {shots.length > 1 && (
                        <>
                            <span className={styles.heroCount}>{shot + 1}/{shots.length}</span>
                            {shot > 0 && (
                                <button
                                    type="button"
                                    className={`${styles.heroNav} ${styles.heroNavPrev}`}
                                    onClick={() => setShot(shot - 1)}
                                    aria-label="Previous photo"
                                >
                                    <Icon icon="mdi:chevron-left" width={18} height={18} />
                                </button>
                            )}
                            {shot < shots.length - 1 && (
                                <button
                                    type="button"
                                    className={`${styles.heroNav} ${styles.heroNavNext}`}
                                    onClick={() => setShot(shot + 1)}
                                    aria-label="Next photo"
                                >
                                    <Icon icon="mdi:chevron-right" width={18} height={18} />
                                </button>
                            )}
                            <div className={styles.heroDots}>
                                {shots.map((_, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`${styles.heroDot} ${i === shot ? styles.heroDotActive : ""}`}
                                        onClick={() => setShot(i)}
                                        aria-label={`Photo ${i + 1} of ${shots.length}`}
                                        aria-current={i === shot || undefined}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    <div className={`${styles.heroScrim} ${shots.length > 1 ? styles.heroScrimWithDots : ""}`}>
                        <span className={styles.heroTitle}>{r.title || "Untitled recruitment"}</span>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    className={`${styles.hero} ${styles.heroEmpty}`}
                    onClick={onJump ? () => onJump("photos") : undefined}
                    disabled={!onJump}
                >
                    <Icon icon="mdi:image-plus-outline" width={26} height={26} />
                    <span>Add a photo</span>
                    <span className={styles.heroEmptySub}>Listings with a photo get opened far more</span>
                </button>
            )}

            {/* ── Meta row ── */}
            <div className={styles.meta}>
                {dateLabel !== null && (
                    <span className={styles.metaItem}>
                        <Icon icon="mdi:calendar" width={13} height={13} />
                        {date ? <>{dateLabel}: <strong>{date}</strong></> : prompt("date", `Add a ${dateLabel.toLowerCase()}`)}
                    </span>
                )}
                <span className={styles.metaItem}>
                    <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                    {r.location_name
                        ? <strong>{[r.venue_name, r.location_name].filter(Boolean).join(" · ")}</strong>
                        : prompt("location", "Add a location")}
                </span>
                <span className={styles.metaItem}>
                    <Icon icon="mdi:calendar-clock" width={13} height={13} />
                    {deadline ? <>Closes <strong>{deadline}</strong></> : prompt("deadline", "No deadline")}
                </span>
            </div>

            {/* ── The real card ── */}
            <div className={styles.cardWrap} inert>
                {/* variant="viewer" on purpose: the acting actor IS this org,
                    but the block is headed "what players will see", so the card
                    has to be the players' one — Apply, the bookmark, and the
                    count they would read. */}
                <RecruitmentCard recruitment={r} showOrg variant="viewer" />
            </div>

            {/* ── Detail block ── */}
            <div className={styles.detail}>
                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>About</h4>
                    {r.short_description
                        ? <p className={styles.tagline}>{r.short_description}</p>
                        : prompt("tagline", "Add a card tagline")}
                    {r.description
                        ? <MarkdownLite text={r.description} className={`${styles.body} ${styles.bodyClamp}`} />
                        : prompt("description", "Add a full description")}
                </section>

                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>Who can come</h4>
                    <div className={styles.chips}>
                        {r.age_categories.length === 0
                            ? <span className={styles.chip}>All ages</span>
                            : r.age_categories.map(g => (
                                <span key={g.id} className={styles.chip} title={formatBirthYears(g.min_birth_year, g.max_birth_year)}>
                                    {g.title || "Untitled"}
                                    {g.reporting_time && <em> · {formatReportingTime(g.reporting_time)}</em>}
                                </span>
                            ))}
                        <span className={styles.chip}>{GENDER_LABEL[r.gender || "all"] ?? "Open to all"}</span>
                        {r.positions.length > 0 && r.positions.map(p => (
                            <span key={p.position.id} className={styles.chip}>{p.position.name}</span>
                        ))}
                    </div>
                    {r.eligibility_criteria.length > 0 && (
                        <ul className={styles.list}>
                            {r.eligibility_criteria.map(c => <li key={c.id}>{c.title}</li>)}
                        </ul>
                    )}
                </section>

                {r.requirements.length > 0 && (
                    <section className={styles.section}>
                        <h4 className={styles.sectionTitle}>What to bring</h4>
                        <ul className={styles.list}>
                            {r.requirements.map(req => (
                                <li key={req.id}>{req.title}{!req.is_mandatory && <em> (optional)</em>}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {r.benefits.length > 0 && (
                    <section className={styles.section}>
                        <h4 className={styles.sectionTitle}>What you get</h4>
                        <div className={styles.chips}>
                            {r.benefits.map(b => (
                                <span key={b.id} className={styles.chip}>
                                    <Icon icon={BENEFIT_ICONS[b.icon_name] ?? "mdi:star-outline"} width={12} height={12} />
                                    {b.title}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                <section className={styles.section}>
                    <h4 className={styles.sectionTitle}>How to apply</h4>
                    <div className={styles.chips}>
                        <span className={styles.chip}>{APPLY_METHOD_LABEL[r.apply_method] ?? r.apply_method}</span>
                        <span className={styles.chip}>{fee}</span>
                        {r.questions_count > 0 && (
                            <span className={styles.chip}>{r.questions_count} question{r.questions_count > 1 ? "s" : ""}</span>
                        )}
                    </div>
                    {r.apply_method === "external" && r.external_apply_url && (
                        <p className={styles.body}>{r.external_apply_url}</p>
                    )}
                    {contacts.length > 0 ? (
                        <ul className={styles.list}>
                            {contacts.map(c => (
                                <li key={c.id}>
                                    <Icon icon={c.contact_type === "phone" ? "mdi:phone-outline" : "mdi:email-outline"} width={12} height={12} />
                                    {c.name ? `${c.name} · ` : ""}{c.value}
                                </li>
                            ))}
                        </ul>
                    ) : prompt("contact", "Add a contact")}
                </section>
            </div>
        </div>
    )
}
