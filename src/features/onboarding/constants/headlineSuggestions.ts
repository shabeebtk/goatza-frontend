/**
 * Template-based headline generator for the onboarding Details step. No AI, no
 * backend — just short phrases + {position}/{sport} placeholders that degrade
 * gracefully: position+sport → sport-only → generic. Works for any seeded sport.
 */

export type HeadlineContext = {
  sport?: string
  position?: string
}

// Short flavour phrases per sport (lowercased key). Any sport not listed falls
// back to GENERIC_PHRASES, so new seeded sports still get sensible output.
const SPORT_PHRASES: Record<string, string[]> = {
  football: ["Finishing & movement", "Pace & positioning", "Vision & passing", "Work rate & pressing"],
  cricket: ["Timing & technique", "Line & length", "Sharp fielding", "Power hitting"],
}

const GENERIC_PHRASES = [
  "Discipline & drive",
  "Work ethic & consistency",
  "Team-first mentality",
  "Hungry to compete",
]

// Deterministic PRNG so a given seed always yields the same set (lets the shuffle
// button regenerate predictably without Math.random surprises mid-render).
function seededShuffle<T>(input: T[], seed: number): T[] {
  const arr = input.slice()
  let s = (seed * 9301 + 49297) % 233280
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr
  const n = ((by % arr.length) + arr.length) % arr.length
  return [...arr.slice(n), ...arr.slice(0, n)]
}

function buildCandidates(ctx: HeadlineContext, seed: number): string[] {
  const { sport, position } = ctx
  const basePhrases =
    (sport && SPORT_PHRASES[sport.toLowerCase()]) || GENERIC_PHRASES
  // Rotate the phrase pool by the seed so refresh surfaces different wording.
  const p = rotate(basePhrases, seed)

  let out: string[]

  if (position && sport) {
    out = [
      `${position} | ${p[0]} | Open to trials`,
      `${sport} ${position} focused on ${p[1].toLowerCase()}`,
      `${position} looking for club opportunities`,
      `${p[2]} | ${position} ready to compete`,
      `${sport} ${position} | Open to trials & opportunities`,
    ]
  } else if (sport) {
    out = [
      `${sport} player | ${p[0]} | Open to trials`,
      `Passionate ${sport} player looking to grow`,
      `${sport} athlete | ${p[1]}`,
      `${sport} player open to trials & opportunities`,
    ]
  } else {
    out = [
      "Athlete open to trials & opportunities",
      `${p[0]} | Looking to grow`,
      "Passionate about the game | Ready to compete",
      "Open to trials — building my journey",
      `${p[2]} | Open to opportunities`,
    ]
  }

  // De-dupe while preserving order.
  return Array.from(new Set(out))
}

/**
 * Returns up to 4 short headline suggestions for the given context and seed.
 * Change the seed (shuffle button) to get a fresh set.
 */
export function generateHeadlineSuggestions(
  ctx: HeadlineContext,
  seed = 0
): string[] {
  const candidates = buildCandidates(ctx, seed)
  return seededShuffle(candidates, seed).slice(0, 4)
}
