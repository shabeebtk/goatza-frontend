/**
 * Every word that goes out over WhatsApp, in one file.
 *
 * Kept together and out of the components on purpose: this copy is the part
 * most likely to be tuned after watching a real org use it, and hunting five
 * components for the phrasing is how half of them end up saying something
 * slightly different.
 *
 * HOUSE RULES for everything here:
 *   * Plain text. WhatsApp renders a subset of markdown and mangles the rest.
 *   * A link on its own line, so WhatsApp makes it a preview card.
 *   * NEVER a phone number in a body. The Confirmed-tab list goes into a
 *     group chat, and a list of players' numbers pasted into one is a data
 *     leak with the org's name on it.
 */

type Session = {
    date: string
    start_time?: string | null
    venue_name?: string
    city?: string
}

/** "Sat 10 Oct" — the venue's calendar, matching the rest of the product. */
function day(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return date
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed)
}

/** "9:00 am" from "09:00:00". Empty when there is no time. */
function clock(time?: string | null): string {
    if (!time) return ""
    const [hours, minutes] = time.split(":")
    const hour = Number(hours)
    if (Number.isNaN(hour)) return ""
    const suffix = hour < 12 ? "am" : "pm"
    return `${hour % 12 === 0 ? 12 : hour % 12}:${minutes ?? "00"} ${suffix}`
}

function sessionLine(session: Session): string {
    return [day(session.date), clock(session.start_time), session.venue_name || session.city]
        .filter(Boolean)
        .join(" · ")
}

/** An org reaching one applicant who has not opened Goatza. */
export function applicantMessage(args: {
    playerName: string
    orgName: string
    recruitmentTitle: string
    url: string
}): string {
    return [
        `Hi ${args.playerName}, this is ${args.orgName} about ${args.recruitmentTitle}.`,
        "",
        args.url,
    ].join("\n")
}

/**
 * The Confirmed tab's "Copy list" — what the org pastes into its own staff
 * group the night before.
 *
 * DELIBERATELY NO PHONE NUMBERS. This text lands in a group chat; a column of
 * applicants' numbers in one is a leak, and the org already has them in the
 * pipeline where they belong.
 */
export function confirmedListMessage(args: {
    recruitmentTitle: string
    orgName: string
    players: {
        name: string
        ageGroup?: string | null
        reportingTime?: string | null
    }[]
}): string {
    const lines = args.players.map((player, index) => {
        const tail = [player.ageGroup, clock(player.reportingTime)]
            .filter(Boolean)
            .join(" · ")
        return `${index + 1}. ${player.name}${tail ? ` — ${tail}` : ""}`
    })

    return [
        `*${args.recruitmentTitle}* — confirmed players`,
        `${args.orgName} · ${args.players.length} player${args.players.length === 1 ? "" : "s"}`,
        "",
        ...lines,
    ].join("\n")
}

/**
 * A player sharing their own pass. The common recipient is a PARENT — often
 * the one actually driving them to the ground — which is why this reads as a
 * person telling someone where to be, not as a notification.
 */
export function passMessage(args: {
    playerName: string
    recruitmentTitle: string
    orgName: string
    sessions: Session[]
    ageGroup?: string | null
    reportingTime?: string | null
    url: string
}): string {
    const when = args.sessions.map(sessionLine).filter(Boolean)
    const reporting = clock(args.reportingTime)

    return [
        `I'm confirmed for *${args.recruitmentTitle}* (${args.orgName}).`,
        "",
        ...when,
        args.ageGroup ? `Group: ${args.ageGroup}` : "",
        reporting ? `Report by ${reporting}` : "",
        "",
        args.url,
    ]
        .filter((line, index, all) => line !== "" || all[index - 1] !== "")
        .join("\n")
}

/** Sharing the posting itself — the public link, so it opens for anybody. */
export function recruitmentShareMessage(args: {
    recruitmentTitle: string
    orgName: string
    url: string
}): string {
    return [
        `*${args.recruitmentTitle}*`,
        args.orgName,
        "",
        args.url,
    ].join("\n")
}
