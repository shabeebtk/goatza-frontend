import type { MemberItem, Roster, SquadListItem } from "./types"

/**
 * The season a squad is playing, as a club writes it: "2026–27" (an en dash, two
 * digits after it). June onward is this year into next; before June it is last
 * year into this one.
 */
export function currentSeasonLabel(date: Date = new Date()): string {
  const year = date.getFullYear()
  const start = date.getMonth() >= 5 ? year : year - 1
  const end = String((start + 1) % 100).padStart(2, "0")
  return `${start}–${end}`
}

/** "Youth · U17 · 2026–27", leaving out whatever the club left empty. */
export function squadMeta(
  squad: Pick<SquadListItem, "level_label" | "age_group" | "season">
): string {
  return [squad.level_label, squad.age_group, squad.season]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ")
}

/** The lowest shirt numbers (1–99) no active player in the roster is wearing. */
export function freeJerseyNumbers(roster: Roster | null | undefined, count = 6): number[] {
  const taken = new Set<number>()
  for (const group of roster?.groups ?? []) {
    for (const member of group.members) {
      if (member.status === "active" && member.jersey_number != null) {
        taken.add(member.jersey_number)
      }
    }
  }

  const free: number[] = []
  for (let number = 1; number <= 99 && free.length < count; number += 1) {
    if (!taken.has(number)) free.push(number)
  }
  return free
}

/** "16 yrs", or "" when the server did not send an age. */
export function ageLabel(age: number | null | undefined): string {
  return typeof age === "number" && age >= 0 ? `${age} yrs` : ""
}

/** "1 player" / "12 players", in the sport's own words. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Two letters for an Avatar with no photo. */
export function initialsOf(name: string | null | undefined): string {
  return name?.trim().slice(0, 2).toUpperCase() || "?"
}

/** "Centre-back · 16 yrs": the squad's position, else their own, else "No position". */
export function playerLine(
  position: { name: string } | null | undefined,
  age: number | null | undefined
): string {
  return [position?.name || "No position", ageLabel(age)].filter(Boolean).join(" · ")
}

/** Every active player in the roster, group by group. */
export function rosterMembers(roster: Roster | null | undefined): MemberItem[] {
  return (roster?.groups ?? []).flatMap((group) => group.members)
}

/** Who wears `number` in this squad, leaving out `exceptMemberId` (the one being edited). */
export function jerseyHolder(
  roster: Roster | null | undefined,
  number: number,
  exceptMemberId?: string
): MemberItem | undefined {
  return rosterMembers(roster).find(
    (member) =>
      member.id !== exceptMemberId &&
      member.status === "active" &&
      member.jersey_number === number
  )
}

/** The captain's row, when the roster is loaded and the squad has one. */
export function captainOf(
  captainMemberId: string | null | undefined,
  roster: Roster | null | undefined
): MemberItem | undefined {
  if (!captainMemberId) return undefined
  return rosterMembers(roster).find((member) => member.id === captainMemberId)
}

/** "U17 Boys" → "u17-boys", for a file name. */
export function fileSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * A squad's public page, under its club's public profile. The one URL a squad
 * has outside the club's own admin space.
 */
export function publicSquadPath(orgUsername: string, squadId: string): string {
  return `/organization/profile/${orgUsername}/squads/${squadId}`
}

/** The invite link's page for `token`, path-encoded like every use of it. */
export function squadInvitePath(token: string): string {
  return `/squad-invite/${encodeURIComponent(token)}`
}

/** All of a club's squads, under its public profile. */
export function publicSquadsPath(orgUsername: string): string {
  return `/organization/profile/${orgUsername}/squads`
}

/** "Football · Youth · 2026–27", for a showcase card or hero. */
export function showcaseMeta(squad: {
  sport: { name: string }
  level_label: string
  season: string
}): string {
  return [squad.sport.name, squad.level_label, squad.season]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ")
}

/** The first word of a name, for the captain stat. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ""
}
