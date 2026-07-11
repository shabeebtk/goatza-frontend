import { isAxiosError } from "axios"

/**
 * Backend error envelope (see utils/response.py + utils/errors.py):
 *   { success:false, message:"<human>", error:"<human>", data:{ errors:{ field:"msg" } } }
 */
type ApiErrorData = {
  message?: string
  error?: string
  detail?: string
  data?: { errors?: Record<string, string> }
}

/**
 * Turn any thrown error into the best human-readable message, in priority:
 *   response.data.message → response.data.error → first response.data.data.errors value
 *   → offline message (no response) → provided fallback.
 *
 * Never returns axios's raw "Request failed with status code NNN".
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (isAxiosError(err)) {
    // No response at all → the request never reached the server.
    if (!err.response) {
      return "Check your internet connection and try again"
    }

    const data = err.response.data as ApiErrorData | undefined
    if (data?.message) return data.message
    if (data?.error) return data.error
    if (data?.detail) return data.detail

    const fieldErrors = data?.data?.errors
    if (fieldErrors) {
      const first = Object.values(fieldErrors).find(
        (v) => typeof v === "string" && v.trim()
      )
      if (first) return first
    }

    return fallback
  }

  // Non-axios throws (e.g. the Cloudinary upload's `new Error(...)`) carry a
  // friendly message of their own — but never the axios status-code string.
  if (err instanceof Error && err.message) return err.message

  return fallback
}

/**
 * Pull the structured field errors ({ field: "message" }) out of a 400 response,
 * or null when there are none. Used to surface errors inline on the right field.
 */
export function getApiFieldErrors(err: unknown): Record<string, string> | null {
  if (!isAxiosError(err)) return null

  const errors = (err.response?.data as ApiErrorData | undefined)?.data?.errors
  if (!errors || typeof errors !== "object") return null

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(errors)) {
    if (typeof value === "string" && value.trim()) out[key] = value
  }
  return Object.keys(out).length ? out : null
}
