/**
 * The founding-player card — a sibling of ProfileCard, not a copy of it.
 *
 * NOT a DOM component. This renders under Satori (via next/og), so the same
 * rules that shaped ProfileCard apply here without exception:
 *
 *   * Flexbox only. Anything with more than one child carries an explicit
 *     `display: "flex"` and an explicit `flexDirection`.
 *   * No `filter: blur()`. Soft light is a gradient or it does not exist.
 *   * Inline styles only. No stylesheet, no classes, no CSS variables.
 *   * Letter-spacing in px, never em — hence `track()`.
 *   * No `<br>`. Two lines means two elements.
 *   * `z-index` is ignored; stacking is document order, which is why the wash
 *     is written before the content that sits over it.
 *
 * The palette, the three faces and the mark are IMPORTED from ProfileCard
 * rather than restated, so "the same green" is the same constant and not a
 * matching hex that drifts on the next brand tweak.
 *
 * WHAT THIS CARD IS FOR, AND WHY THE ORDER CHANGED
 *
 * It used to be a number on a background: "#47" at 460px with the name under
 * it. That is a receipt. It tells the person holding it something they already
 * know, and it tells the twenty teammates who see it in a story nothing at all
 * — not what Goatza is, not that it is for them, not when it opens.
 *
 * So the hierarchy is now PLAYER first, PLATFORM second, number third:
 *
 *   mark  →  FOUNDING PLAYER  →  the name  →  #37 · city  →  ─  →  tagline  →  footer
 *
 * The name is the anchor because the person posting it is the subject, and
 * because a name is what makes a friend look twice. The number drops to a
 * quiet line: it is the proof, not the point. The tagline is the only line
 * addressed to the AUDIENCE rather than the owner, which is what turns a
 * screenshot into an ad — and it is sized to survive the compression and the
 * thumb-sized preview a story gets scrolled past at.
 *
 * Still one format, no QR and no photography, for the reasons ProfileCard's
 * counterpart lists: a signup has no media, and the profile URL a QR would
 * point at does not exist until launch.
 *
 * NOTHING HERE SHRINKS TO FIT. Satori draws an overflowing line straight off
 * the edge, so every size is decided before the render: the name through
 * `nameFontSize` (the ladder measures the longest WORD, which is what cannot be
 * broken), and every other line is a fixed size proven against its longest
 * realistic content in `__tests__/render.test.tsx`.
 */

import {
  BODY,
  DISPLAY,
  FAINT,
  GoatzaMark,
  GREEN,
  HAIRLINE,
  INK,
  LABEL,
  MUTE,
  track,
} from "@/features/profile/utils/shareCard/ProfileCard"
import { nameFontSize, nameLines } from "@/features/profile/utils/shareCard/nameLadder"
import { CARD_SIZES } from "@/features/profile/utils/shareCard/types"

import { LAUNCH_DATE_LABEL, SITE_DOMAIN } from "../../types"

const { width: WIDTH, height: HEIGHT } = CARD_SIZES.story

/** Matches ProfileCard's story padding, which is also what nameLadder's
 *  FRAME_WIDTH assumes when it clamps the name to fit. */
const PAD = 80

const MARK_LOGO = 56
const MARK_TEXT = 40

/** The eyebrow over the name. Small and tracked wide — it labels the name, it
 *  does not compete with it. */
const EYEBROW = 30

/** "#37 · Kozhikode". Deliberately close to the eyebrow's size: this is the
 *  line that used to be 460px tall, and the whole redesign is the decision that
 *  it should not be. */
const META = 34

/**
 * The tagline, on two lines.
 *
 * 64px in Bebas: the longest of the two lines is 18 characters, which at the
 * face's ~0.52 width ratio comes to ~599px inside a 920px frame — comfortable
 * even before the ladder's pessimism. Split into two elements because Satori
 * has no `<br>`, and split HERE rather than at render time because the break
 * is a typographic decision, not a wrapping accident.
 */
const TAGLINE = 64
const TAGLINE_LINES = ["Where the greatest", "get discovered"] as const

const FOOTER = 28

/**
 * How tall the name is allowed to get.
 *
 * The ladder's top rung is 180px, which is right for a short name and is what
 * makes this card feel like it is about a person. No cap below it any more —
 * the old 92px cap existed only to keep the name out of the number's way, and
 * the number is no longer the hero.
 */
const NAME_LINE_HEIGHT = 1.04

export interface FoundingPlayerCardData {
  name: string
  /** The DISPLAY number the backend published — never the raw row number. */
  signupNumber: number
  /** Short city name ("Kozhikode") as the API published it. */
  city: string | null
  /** ISO country code ("IN"), shown after the city when both are known. */
  countryCode: string | null
  /**
   * Whether this signup made the founding cohort, as the API decided it.
   *
   * The eyebrow used to read "Founding Player" unconditionally, which was true
   * while every signup was one. It is not any more — the backend closes the
   * cohort at the goal — and a card that hands somebody a title they do not
   * have is the one thing a shareable image must never do.
   */
  isFounding: boolean
}

/**
 * "#37 · Kozhikode, IN" — or whichever parts exist.
 *
 * Assembled rather than templated so a missing city cannot leave a dangling
 * separator: a lone "·" on a card is a bug somebody has already posted.
 */
function metaLine(data: FoundingPlayerCardData): string {
  const place = [data.city, data.countryCode].filter(Boolean).join(", ")
  return [`#${data.signupNumber}`, place].filter(Boolean).join("   ·   ")
}

export default function FoundingPlayerCard({
  data,
}: {
  data: FoundingPlayerCardData
}) {
  const nameSize = nameFontSize(data.name, "story")
  const lines = nameLines(data.name, "story")
  const meta = metaLine(data)

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: INK,
        color: "#fff",
        fontFamily: BODY,
        overflow: "hidden",
      }}
    >
      {/* Written first so the content paints over it — Satori stacks in
          document order and ignores z-index. A linear gradient rather than a
          radial glow: this is the treatment ProfileCard's pattern band already
          proves renders, and soft light has to be a gradient here anyway
          because Satori has no blur. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          background:
            "linear-gradient(170deg, rgba(0,201,110,.13) 0%, rgba(0,201,110,.05) 30%, rgba(10,10,10,0) 58%)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: PAD,
        }}
      >
        {/* Mark — top left, the same lockup as the story profile card so the
            two read as one set. Smaller than the profile card's because here it
            is a signature, not a header: the name below it is the subject. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <GoatzaMark size={MARK_LOGO} />
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: MARK_TEXT,
              letterSpacing: track(MARK_TEXT, 0.16),
            }}
          >
            GOATZA
          </span>
        </div>

        {/* The hero block, optically centred in what is left. `flexGrow: 1`
            plus `justifyContent: center` rather than a fixed offset, so a
            two-line name and a one-line name both stay centred. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontFamily: LABEL,
              fontSize: EYEBROW,
              letterSpacing: track(EYEBROW, 0.34),
              textTransform: "uppercase",
              color: GREEN,
            }}
          >
            {data.isFounding ? "Founding Player" : "Goatza Player"}
          </span>

          {/* THE ANCHOR. One element per line — no <br> under Satori — at the
              size the ladder proved fits the longest word in it. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 28,
            }}
          >
            {lines.map((line) => (
              <span
                key={line}
                style={{
                  fontFamily: DISPLAY,
                  fontSize: nameSize,
                  lineHeight: NAME_LINE_HEIGHT,
                  letterSpacing: track(nameSize, 0.02),
                  textTransform: "uppercase",
                  color: "#fff",
                }}
              >
                {line}
              </span>
            ))}
          </div>

          <span
            style={{
              fontFamily: LABEL,
              fontSize: META,
              letterSpacing: track(META, 0.14),
              textTransform: "uppercase",
              marginTop: 26,
              color: MUTE,
            }}
          >
            {meta}
          </span>

          {/* The divider. A fixed 180px rather than a full-width rule: it marks
              the turn from the player to the platform, and a rule that reached
              the edges would read as a section break in a document. */}
          <div
            style={{
              display: "flex",
              width: 180,
              height: 2,
              marginTop: 56,
              background: HAIRLINE,
            }}
          />

          {/* The only line addressed to whoever is SCROLLING PAST this, rather
              than to the player holding it. Sized to survive a thumbnail. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 52,
            }}
          >
            {TAGLINE_LINES.map((line) => (
              <span
                key={line}
                style={{
                  fontFamily: DISPLAY,
                  fontSize: TAGLINE,
                  lineHeight: 1.08,
                  letterSpacing: track(TAGLINE, 0.03),
                  textTransform: "uppercase",
                  color: "#fff",
                }}
              >
                {line}
              </span>
            ))}
          </div>
        </div>

        {/* Footer — one row, centred under a centred card. Two tones rather
            than one, matching ProfileCard's footer where the address reads
            brighter than the meta beside it. */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            marginTop: "auto",
          }}
        >
          <span
            style={{
              fontFamily: LABEL,
              fontSize: FOOTER,
              letterSpacing: track(FOOTER, 0.16),
              color: MUTE,
            }}
          >
            {SITE_DOMAIN}
          </span>
          <span style={{ fontFamily: LABEL, fontSize: FOOTER, color: FAINT }}>
            ·
          </span>
          <span
            style={{
              fontFamily: LABEL,
              fontSize: FOOTER,
              letterSpacing: track(FOOTER, 0.2),
              textTransform: "uppercase",
              color: FAINT,
            }}
          >
            Opening {LAUNCH_DATE_LABEL}
          </span>
        </div>
      </div>
    </div>
  )
}
