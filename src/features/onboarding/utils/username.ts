/**
 * Client mirror of the backend `utils/validations.validate_username_format`.
 * Keep this in lock-step with that function — same rules, same messages, same
 * order — so the form never lets through something the server will reject.
 */

// Mirrors RESERVED_USERNAMES in utils/validations.py (compared case-insensitively).
export const RESERVED_USERNAMES = new Set([
  "admin", "root", "support", "help", "api", "system",
  "null", "undefined", "owner", "moderator", "staff",
  "login", "signup", "me", "settings", "profile",
  "user", "users", "dashboard",
])

/**
 * Returns the first format error message for `raw`, or null when it's valid.
 * Validates the trimmed value (the backend strips before checking).
 */
export function validateUsernameFormat(raw: string): string | null {
  const username = raw.trim()

  if (username.length < 3) return "Username must be at least 3 characters"
  if (username.length > 20) return "Username too long"
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "This username is not allowed"
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Only letters, numbers, and underscores allowed"
  if (username.startsWith("_") || username.endsWith("_"))
    return "Username cannot start or end with underscore"
  if (username.includes("__")) return "Username cannot contain consecutive underscores"

  return null
}
