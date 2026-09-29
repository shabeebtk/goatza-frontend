/**
 * The trial pass — what a confirmed player shows at the gate.
 *
 * Built to be READ AT A GATE, on a phone, possibly in sunlight, by someone
 * who is late: the date, the reporting time and the venue are the top third
 * and everything else is below them.
 *
 * THE PASS CODE sits directly under the player's name — after it, the most
 * prominent thing here — because that is the order an organiser asks in: who
 * are you, and what is your reference. It is minted on confirmation, so a
 * pass always carries one; the null branch stays as a defensive fallback for
 * an older cached payload, because an empty box labelled "code" reads as
 * broken on the one day it matters.
 *
 * "Share my pass" goes to WhatsApp on purpose: the common recipient is a
 * PARENT, often the one driving them there, and parents are exactly the
 * people who do not have the app.
 */

"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useAuthStore } from "@/store/auth.store"

import type { TrialPass as TrialPassData } from "../../services/announcements.api"
import { formatSessionDate, formatSessionTime } from "../../sessionDisplay"
import { passImageUrl } from "../../utils/passImageUrl"
import { waLink } from "../../whatsapp/waLink"
import { passMessage } from "../../whatsapp/whatsappTemplates"
import styles from "./TrialPass.module.css"

function birthYears(min: number | null, max: number | null): string {
    if (min && max) return `born ${min}–${max}`
    if (min) return `born ${min} or later`
    if (max) return `born ${max} or earlier`
    return ""
}

export default function TrialPass({ pass }: { pass: TrialPassData }) {
    const [downloading, setDownloading] = useState(false)
    const accessToken = useAuthStore((state) => state.accessToken)

    const reportingTime = formatSessionTime(pass.age_group?.reporting_time)

    const shareUrl =
        typeof window === "undefined"
            ? ""
            : `${window.location.origin}/recruitments/${pass.recruitment.id}`

    const shareText = passMessage({
        playerName: pass.player.name,
        recruitmentTitle: pass.recruitment.title,
        orgName: pass.organization.name,
        sessions: pass.sessions,
        ageGroup: pass.age_group?.title,
        reportingTime: pass.age_group?.reporting_time,
        url: shareUrl,
    })

    /**
     * The image route is NOT world-readable by id, so it cannot be an
     * `<img src>` — a browser sends no Authorization header on one. Fetch it
     * with the token, turn the blob into a download, and revoke the object
     * URL straight away.
     */
    const download = async () => {
        if (!accessToken) return
        setDownloading(true)
        try {
            const response = await fetch(passImageUrl(pass.application_id), {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!response.ok) return

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = `trial-pass-${pass.recruitment.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")}.png`
            anchor.click()
            URL.revokeObjectURL(url)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <div className={styles.wrap}>
            <article className={styles.pass}>
                <header className={styles.head}>
                    <Avatar
                        src={pass.organization.logo}
                        initials={pass.organization.name.slice(0, 2).toUpperCase()}
                        size="sm"
                    />
                    <div className={styles.headText}>
                        <span className={styles.org}>
                            {pass.organization.name}
                            {pass.organization.is_verified && (
                                <Icon icon="mdi:check-decagram" width={13} height={13} />
                            )}
                        </span>
                        <h1 className={styles.title}>{pass.recruitment.title}</h1>
                    </div>
                    <span className={styles.badge}>Confirmed</span>
                </header>

                {/* WHEN AND WHERE, first. */}
                <section className={styles.when}>
                    {pass.sessions.map((session) => (
                        <div key={session.id} className={styles.session}>
                            <span className={styles.date}>
                                {formatSessionDate(session.date)}
                            </span>
                            <span className={styles.sessionMeta}>
                                {[
                                    session.title || null,
                                    formatSessionTime(session.start_time),
                                    session.venue_name || session.city || null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            {session.venue_link && (
                                <a
                                    className={styles.map}
                                    href={session.venue_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                                    Open map
                                </a>
                            )}
                        </div>
                    ))}

                    {reportingTime && (
                        <p className={styles.reporting}>
                            <Icon icon="mdi:clock-outline" width={14} height={14} />
                            Report by <strong>{reportingTime}</strong>
                        </p>
                    )}
                </section>

                <section className={styles.player}>
                    <Avatar
                        src={pass.player.photo}
                        initials={pass.player.name.slice(0, 2).toUpperCase()}
                        size="md"
                    />
                    <div>
                        <span className={styles.playerName}>{pass.player.name}</span>
                        {pass.age_group && (
                            <span className={styles.group}>
                                {pass.age_group.title}
                                {birthYears(
                                    pass.age_group.min_birth_year,
                                    pass.age_group.max_birth_year,
                                )
                                    ? ` · ${birthYears(
                                          pass.age_group.min_birth_year,
                                          pass.age_group.max_birth_year,
                                      )}`
                                    : ""}
                            </span>
                        )}
                    </div>
                </section>

                {/* THE CODE. Always present on a confirmed application — the
                    guard is a defensive fallback for an older cached payload,
                    and then nothing renders at all rather than an empty box.

                    Large and MONOSPACED: this is read aloud across a desk and
                    written down by somebody else, so character clarity and
                    even spacing beat styling. */}
                {pass.pass_code && (
                    <section className={styles.code}>
                        <span className={styles.codeLabel}>Pass code</span>
                        <span className={styles.codeValue}>{pass.pass_code}</span>
                        <span className={styles.codeHint}>
                            Show this if the organiser asks to confirm your
                            registration
                        </span>
                    </section>
                )}

                {pass.bring.length > 0 && (
                    <section className={styles.bring}>
                        <h2 className={styles.sectionTitle}>What to bring</h2>
                        <ul className={styles.bringList}>
                            {pass.bring.map((item) => (
                                <li key={item.id}>
                                    {item.title}
                                    {!item.is_mandatory && (
                                        <span className={styles.optional}> (optional)</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {pass.fee.is_paid_trial && (
                    <section className={styles.fee}>
                        <Icon
                            icon={pass.fee.fee_paid ? "mdi:cash-check" : "mdi:cash-clock"}
                            width={15}
                            height={15}
                        />
                        <span>
                            Fee: <strong>{pass.fee.fee_paid ? "Paid" : "Not marked"}</strong>
                            {!pass.fee.fee_paid && pass.fee.amount
                                ? ` · ${pass.fee.currency} ${pass.fee.amount}${
                                      pass.fee.note ? ` — ${pass.fee.note}` : ""
                                  }`
                                : ""}
                        </span>
                    </section>
                )}

            </article>

            <div className={styles.actions}>
                <button
                    className={styles.action}
                    onClick={download}
                    type="button"
                    disabled={downloading || !accessToken}
                >
                    <Icon icon="mdi:download" width={16} height={16} />
                    {downloading ? "Preparing…" : "Download image"}
                </button>

                <a
                    className={styles.action}
                    href={waLink(null, shareText)}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Icon icon="mdi:whatsapp" width={16} height={16} />
                    Share my pass
                </a>
            </div>

            <Link
                className={styles.back}
                href={`/recruitments/${pass.recruitment.id}`}
            >
                View the trial
            </Link>
        </div>
    )
}
