/**
 * The under-13 refusal, remembered on the device.
 *
 * WHAT THIS IS FOR
 *
 * The backend refuses an under-13 signup and says nothing about why — no age
 * limit, no "you must be 13 or older", because that sentence is a hint about
 * which year to retype. But silence alone is thin protection when the retry
 * costs one click: the form is still on screen, the birthday boxes still hold
 * the numbers that were rejected, and the fix is to change one digit. So the
 * refusal is written down here and the form refuses to submit again for a
 * while.
 *
 * WHAT IT IS NOT
 *
 * It is not enforcement. localStorage is per-browser, per-profile, and clears
 * with site data — an incognito window, a different browser, or a phone
 * instead of a laptop all walk straight past it, and anyone who wants to get
 * around it will. The backend is the thing that actually refuses; this only
 * removes the *instant* retry, which is the one that actually happens. An
 * eleven-year-old who has to come back tomorrow mostly does not come back with
 * a different year, and that is the entire claim being made.
 *
 * The stored record holds NO date of birth. We have just decided not to keep
 * this person's data; writing their birthday into their browser as the parting
 * act would be a strange way to honour that.
 */

const STORAGE_KEY = "goatza:auth:age-refused"

/**
 * How long a refused device stays refused.
 *
 * Long enough that "change the year and press it again" is not the obvious
 * next move, short enough that a mistyped year — a real adult who typed 2019
 * for 1991 — is an annoyance and not a permanent lockout. They also have the
 * other escape hatches above, which is precisely why this can afford to be a
 * soft speed bump rather than a wall.
 */
export const AGE_REFUSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000

/** The neutral sentence. Kept identical to the backend's, deliberately. */
export const AGE_REFUSAL_MESSAGE = "You can't create an account right now."

type StoredRefusal = {
  /** Epoch ms of the refusal. No birthdate, ever — see the module note. */
  at: number
  /** The message the server gave, so the second showing reads the same. */
  message: string
}

/**
 * Every access is wrapped, because localStorage throws rather than returning
 * null in more places than it looks: Safari private mode historically, an
 * embedded webview with site data disabled, and any browser where the user has
 * blocked storage outright. A signup form must not be taken down by the
 * unavailability of a speed bump.
 */
function read(): StoredRefusal | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredRefusal>
    if (typeof parsed?.at !== "number") return null

    return { at: parsed.at, message: parsed.message || AGE_REFUSAL_MESSAGE }
  } catch {
    return null
  }
}

/** Record that this device was refused. Called on an under-13 rejection. */
export function rememberAgeRefusal(message?: string): void {
  try {
    const record: StoredRefusal = {
      at: Date.now(),
      message: message || AGE_REFUSAL_MESSAGE,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Storage unavailable. The backend still refuses; only the speed bump is
    // lost, and that is not worth an error in front of the user.
  }
}

/**
 * The message to show if this device is still inside its cool-off, else null.
 *
 * Returns the message rather than a boolean so callers cannot accidentally
 * invent their own wording for a refusal whose whole point is that it says
 * nothing extra.
 */
export function ageRefusalMessage(): string | null {
  const record = read()
  if (!record) return null

  if (Date.now() - record.at >= AGE_REFUSAL_COOLDOWN_MS) {
    clearAgeRefusal()
    return null
  }

  return record.message
}

/** True while this device is inside its cool-off. */
export function isAgeRefused(): boolean {
  return ageRefusalMessage() !== null
}

export function clearAgeRefusal(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See rememberAgeRefusal.
  }
}

/**
 * Whether an API error is the age refusal.
 *
 * Matches on the machine code the backend sends alongside the message
 * (`data.code === "under_age"`), never on the message text — the message is
 * user-facing copy and will be reworded, and a client that keys off it would
 * silently stop recognising the one rejection it exists to handle.
 */
export function isUnderAgeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false

  const response = (
    err as { response?: { data?: { data?: { code?: string } } } }
  ).response

  return response?.data?.data?.code === "under_age"
}
