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
 * Where it deliberately differs: this card is centred and has no photography,
 * no avatar, no club panel and no QR. It has no photograph because a signup
 * has no media, and no QR because the profile card's code points at a profile
 * URL that will not exist until launch — a card whose only interactive element
 * scans to a 404 is worse than one with nothing to scan.
 *
 * One format only. There is no `link` variant because there is no page for a
 * crawler to scrape: /join is the landing page, and it is not per-player.
 */

import {
  BODY,
  DISPLAY,
  FAINT,
  GoatzaMark,
  GREEN,
  INK,
  LABEL,
  MUTE,
  track,
} from "@/features/profile/utils/shareCard/ProfileCard"
import { nameFontSize, nameLines } from "@/features/profile/utils/shareCard/nameLadder"
import { CARD_SIZES } from "@/features/profile/utils/shareCard/types"

const { width: WIDTH, height: HEIGHT } = CARD_SIZES.story

/** Matches ProfileCard's story padding, which is also what nameLadder's
 *  FRAME_WIDTH assumes when it clamps the name to fit. */
const PAD = 80

const MARK_LOGO = 60
const MARK_TEXT = 44

/**
 * The name is secondary here — the number is the hero — so the ladder's story
 * sizes (up to 180px) are capped well below it. Capping only ever makes the
 * text smaller than the size the ladder proved fits, so the fit guarantee
 * survives the cap.
 */
const NAME_MAX = 92

/**
 * How big "#47" is drawn.
 *
 * By digit count, because Satori does not shrink text to fit and will happily
 * draw a five-digit number straight off the edge of the frame. The widest case
 * here is "#99999" at 260px, which at Bebas's ~0.52 width ratio comes to ~811px
 * inside a 920px frame.
 */
function numberFontSize(signupNumber: number): number {
  const digits = String(Math.max(1, Math.floor(signupNumber))).length

  if (digits <= 2) return 460
  if (digits === 3) return 400
  if (digits === 4) return 320
  return 260
}

export interface FoundingPlayerCardData {
  name: string
  signupNumber: number
  /** Display label ("Kozhikode"), already resolved from the API's slug. */
  district: string | null
  /** Display label ("Striker"), already resolved from the API's slug. */
  position: string | null
}

export default function FoundingPlayerCard({
  data,
}: {
  data: FoundingPlayerCardData
}) {
  const numberSize = numberFontSize(data.signupNumber)
  const nameSize = Math.min(nameFontSize(data.name, "story"), NAME_MAX)
  const lines = nameLines(data.name, "story")

  // "Kozhikode · Striker", or whichever one of the two exists, or nothing.
  // Absent rather than blank: a lone separator on a card is a bug somebody
  // screenshots.
  const meta = [data.district, data.position].filter(Boolean).join("  ·  ")

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
        {/* Mark — top left, the same lockup and the same sizes as the story
            profile card, so the two read as one set. */}
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
            two-line name and a five-digit number both stay centred. */}
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
              fontSize: 30,
              letterSpacing: track(30, 0.32),
              textTransform: "uppercase",
              color: GREEN,
            }}
          >
            Founding Player
          </span>

          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: numberSize,
              lineHeight: 1,
              letterSpacing: track(numberSize, 0.01),
              marginTop: 24,
              color: "#fff",
            }}
          >
            #{data.signupNumber}
          </span>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 40,
            }}
          >
            {lines.map((line) => (
              <span
                key={line}
                style={{
                  fontFamily: DISPLAY,
                  fontSize: nameSize,
                  lineHeight: 1.04,
                  letterSpacing: track(nameSize, 0.02),
                  textTransform: "uppercase",
                  color: "#fff",
                }}
              >
                {line}
              </span>
            ))}
          </div>

          {meta ? (
            <span
              style={{
                fontFamily: LABEL,
                fontSize: 34,
                letterSpacing: track(34, 0.14),
                textTransform: "uppercase",
                marginTop: 28,
                color: MUTE,
              }}
            >
              {meta}
            </span>
          ) : null}
        </div>

        {/* Footer — the specified line, verbatim and on one row, centred
            under a centred card. Two tones rather than one, matching
            ProfileCard's footer where the address reads brighter than the meta
            beside it. */}
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
              fontSize: 30,
              letterSpacing: track(30, 0.16),
              color: MUTE,
            }}
          >
            goatza.com
          </span>
          <span style={{ fontFamily: LABEL, fontSize: 30, color: FAINT }}>·</span>
          <span
            style={{
              fontFamily: LABEL,
              fontSize: 26,
              letterSpacing: track(26, 0.2),
              textTransform: "uppercase",
              color: FAINT,
            }}
          >
            Launching 1 Jan 2027
          </span>
        </div>
      </div>
    </div>
  )
}
