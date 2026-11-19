import { contactPersonName, firstName } from "./contactLinks"
import type { BestTime, EnquiryStatus, InboxItem } from "./types"

/** The inbox's words for each status, in tab order. */
export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  joined: "Joined",
  not_interested: "Not interested",
}

export const BEST_TIME_LABELS: Record<Exclude<BestTime, "">, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
}

/** The bold name on a card and the detail's title: who to talk to. */
export const contactName = contactPersonName

/** "· for Aditya, 11" or "· for themselves, 19", without the dot. */
export function forLine(item: Pick<InboxItem, "for_whom" | "player_name" | "player_age">): string {
  return item.for_whom === "child"
    ? `for ${firstName(item.player_name)}, ${item.player_age}`
    : `for themselves, ${item.player_age}`
}

/** "U12 Football Foundation · Main Ground", or "General enquiry". */
export function programLine(item: Pick<InboxItem, "program_name" | "location_name">): string {
  if (!item.program_name.trim()) {
    return item.location_name.trim() ? `General enquiry · ${item.location_name.trim()}` : "General enquiry"
  }
  return [item.program_name.trim(), item.location_name.trim()].filter(Boolean).join(" · ")
}

/** The message in quotes when there is one, else "Best time: Evening · On WhatsApp". */
export function noteLine(item: Pick<InboxItem, "message" | "best_time" | "phone_is_whatsapp">): string {
  const message = item.message.trim()
  if (message) return `“${message}”`
  return [
    item.best_time ? `Best time: ${BEST_TIME_LABELS[item.best_time]}` : "",
    item.phone_is_whatsapp ? "On WhatsApp" : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const dayBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)

function shortDate(date: Date, now: Date): string {
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" }
  return date.toLocaleDateString("en-GB", options)
}

function clockTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/** A card's corner: "now", "5m", "2h", "Yesterday", "12 Nov". */
export function relativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (sameDay(date, now)) {
    if (minutes < 1) return "now"
    if (minutes < 60) return `${minutes}m`
    return `${Math.floor(minutes / 60)}h`
  }
  if (sameDay(date, dayBefore(now))) return "Yesterday"
  return shortDate(date, now)
}

/** The detail's "Received": "Today, 2:14 PM", "Yesterday, 9:05 AM", "12 Nov, 2:14 PM". */
export function receivedLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const day = sameDay(date, now) ? "Today" : sameDay(date, dayBefore(now)) ? "Yesterday" : shortDate(date, now)
  return `${day}, ${clockTime(date)}`
}

/** "3:05 PM" on the day, else "12 Nov, 3:05 PM". */
export function changedAtLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return sameDay(date, now) ? clockTime(date) : `${shortDate(date, now)}, ${clockTime(date)}`
}
