/**
 * Motivational one-liners shown on the onboarding Success screen. One is picked at
 * random per completion. Stage 5 polishes the success experience further.
 */
export const SUCCESS_MESSAGES = [
  "Your journey starts now — the field is yours.",
  "Great teams start with great profiles. You're in.",
  "Time to get discovered. Let's make it count.",
  "You're all set — go connect, compete, and grow.",
  "Welcome to the squad. Your next opportunity awaits.",
  "The scouts are watching. Give them something to see.",
  "Every legend started with a first step. This is yours.",
  "You're ready. Now go play your game.",
] as const

/**
 * Deterministically pick a message given a 0..1 seed, so callers control when the
 * randomness happens (once per mount) and avoid re-rolling on every render.
 */
export function pickSuccessMessage(seed: number): string {
  const index = Math.floor(seed * SUCCESS_MESSAGES.length) % SUCCESS_MESSAGES.length
  return SUCCESS_MESSAGES[index]
}
