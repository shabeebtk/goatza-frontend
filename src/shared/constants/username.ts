/**
 * Client mirror of the backend `utils/validations.validate_username_format`.
 *
 * Keep this in lock-step with that function — same rules, same messages, same
 * order — so the form never lets through something the server will reject.
 *
 * Users and organizations draw from ONE namespace on the backend
 * (`usernames.UsernameRegistry`), so there is one set of rules here too. This
 * file used to live under `features/onboarding/`; it moved to `shared/` when
 * the profile and org-profile forms started needing the same answer instead of
 * each carrying its own regex — the org form's was `{3,50}`, which advertised
 * a length the API refuses.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30

/**
 * Mirrors RESERVED_USERNAMES in utils/validations.py (compared
 * case-insensitively).
 *
 * The first block is the app's own live route segments — `/[username]` sits
 * directly beside them. ADDING A ROUTE MEANS ADDING IT HERE AND IN THE BACKEND
 * LIST.
 */
export const RESERVED_USERNAMES = new Set([
  // route segments
  "auth", "card", "chat", "coaching", "cv", "explore", "highlights",
  "home", "join", "matches", "messages", "notifications", "organization",
  "posts", "recruitments", "scouting", "search",

  // pre-existing
  "admin", "root", "support", "help", "api", "system",
  "null", "undefined", "owner", "moderator", "staff",
  "login", "signup", "me", "settings", "profile",
  "user", "users", "dashboard",

  // infrastructure
  "www", "static", "assets", "media", "cdn", "img",
  "favicon", "robots", "sitemap", ".well-known",

  // auth surface
  "logout", "register", "verify", "reset", "password",
  "oauth", "callback", "token", "refresh",

  // product surface
  "feed", "discover", "trending", "saved", "mentions",
  "verifications", "squad", "squads", "team", "teams", "club",
  "academy", "trials", "about", "terms", "privacy", "legal",
  "contact", "download", "app", "pricing", "blog", "careers", "press",

  // impersonation risk
  "goatza", "goatzaapp", "official", "verified",
  "security", "billing", "noreply", "no-reply",
])

/**
 * Returns the first format error message for `raw`, or null when it's valid.
 *
 * Validates the trimmed, LOWERCASED value — the backend normalises before it
 * checks, so "Kochi_FC" and "kochi_fc" are the same handle and must get the
 * same answer here.
 */
export function validateUsernameFormat(raw: string): string | null {
  const username = raw.trim().toLowerCase()

  if (username.length < USERNAME_MIN_LENGTH)
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`
  if (username.length > USERNAME_MAX_LENGTH)
    return `Username cannot be longer than ${USERNAME_MAX_LENGTH} characters`
  if (!/^[a-z0-9_]+$/.test(username))
    return "Only letters, numbers, and underscores allowed"
  if (username.startsWith("_") || username.endsWith("_"))
    return "Username cannot start or end with underscore"
  if (username.includes("__"))
    return "Username cannot contain consecutive underscores"
  // A purely numeric handle is indistinguishable from an id in a URL.
  if (/^[0-9]+$/.test(username)) return "Username cannot be only numbers"
  if (RESERVED_USERNAMES.has(username)) return "This username is not allowed"

  return null
}
