/**
 * The trial pass as an IMAGE — a parent's lock screen, a group chat, a
 * printout at the gate.
 *
 * Satori, not the DOM, so this is a deliberately small subset of CSS: flex
 * only, no grid, no gap shorthand shortcuts it does not implement, explicit
 * `display` on every element. Anything clever here fails at render time on a
 * server nobody is watching, so it stays boring on purpose.
 *
 * Same content priority as the page: WHEN and WHERE occupy the top half,
 * because the person reading this is standing outside a ground trying to work
 * out if they are in the right place.
 */

import { FALLBACK_TRIAL_TIME_ZONE } from "../trialEnded"
import type { TrialPass } from "../services/announcements.api"

const BRAND = "#00B562"
const INK = "#111111"
const MUTED = "#555555"
const LINE = "#e4eae4"

/**
 * "Sat 10 Oct" on THE VENUE's calendar.
 *
 * The zone is read off the payload this route fetched, never off the machine:
 * this renders server-side in Next, where the host's clock has nothing to do
 * with the ground the player is walking to.
 */
function day(date: string, timeZone: string): string {
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return date
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed)
}

function clock(time: string | null): string {
    if (!time) return ""
    const [hours, minutes] = time.split(":")
    const hour = Number(hours)
    if (Number.isNaN(hour)) return ""
    const suffix = hour < 12 ? "am" : "pm"
    return `${hour % 12 === 0 ? 12 : hour % 12}:${minutes ?? "00"} ${suffix}`
}

export default function PassCard({ pass }: { pass: TrialPass }) {
    const reporting = clock(pass.age_group?.reporting_time ?? null)
    const first = pass.sessions[0]
    // See TrialPass.recruitment.timezone: the server does not send this yet,
    // so today this is always the fallback.
    const timeZone = pass.recruitment.timezone || FALLBACK_TRIAL_TIME_ZONE

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#ffffff",
                padding: 64,
                fontFamily: "Outfit",
            }}
        >
            {/* Org + title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
                <div
                    style={{
                        display: "flex",
                        fontSize: 28,
                        color: MUTED,
                        marginBottom: 10,
                    }}
                >
                    {pass.organization.name}
                </div>
                <div
                    style={{
                        display: "flex",
                        fontSize: 56,
                        fontFamily: "Oswald",
                        color: INK,
                        lineHeight: 1.1,
                    }}
                >
                    {pass.recruitment.title}
                </div>
            </div>

            {/* WHEN AND WHERE — the half of the image that has to be readable
                from arm's length. */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    border: `2px solid ${LINE}`,
                    borderRadius: 24,
                    padding: 36,
                    marginBottom: 36,
                }}
            >
                {pass.sessions.slice(0, 3).map((session) => (
                    <div
                        key={session.id}
                        style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}
                    >
                        <div
                            style={{
                                display: "flex",
                                fontSize: 64,
                                fontFamily: "Bebas Neue",
                                color: INK,
                            }}
                        >
                            {day(session.date, timeZone)}
                        </div>
                        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
                            {[clock(session.start_time), session.venue_name || session.city]
                                .filter(Boolean)
                                .join("  ·  ")}
                        </div>
                    </div>
                ))}

                {reporting && (
                    <div
                        style={{
                            display: "flex",
                            fontSize: 34,
                            color: BRAND,
                            fontFamily: "Oswald",
                        }}
                    >
                        REPORT BY {reporting.toUpperCase()}
                    </div>
                )}
            </div>

            {/* Who it is for */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "auto" }}>
                <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
                    Player
                </div>
                <div style={{ display: "flex", fontSize: 44, color: INK }}>
                    {pass.player.name}
                </div>
                {pass.age_group && (
                    <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
                        {pass.age_group.title}
                    </div>
                )}
            </div>

            {/* Footer. The pass code is minted on confirmation, so it is
                always here; the fallback stays for an older cached payload,
                because an empty box labelled "code" reads as broken on the
                one day it matters. */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: `2px solid ${LINE}`,
                    paddingTop: 28,
                }}
            >
                <div style={{ display: "flex", fontSize: 26, color: BRAND }}>
                    CONFIRMED · GOATZA
                </div>
                {pass.pass_code ? (
                    <div
                        style={{
                            display: "flex",
                            fontSize: 40,
                            fontFamily: "Bebas Neue",
                            color: INK,
                        }}
                    >
                        {pass.pass_code}
                    </div>
                ) : (
                    <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
                        {first ? day(first.date, timeZone) : ""}
                    </div>
                )}
            </div>
        </div>
    )
}
