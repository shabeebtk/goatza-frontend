/**
 * The share card itself — a port of `goatza-share-card-v2.html`.
 *
 * NOT a DOM component. This renders under Satori (via next/og), which is a
 * flexbox layout engine with a text renderer bolted on, not a browser. The
 * rules that shaped every line below:
 *
 *   * Flexbox only. Anything with more than one child carries an explicit
 *     `display: "flex"` and an explicit `flexDirection` — there is no block
 *     layout to fall back on and no CSS grid at all.
 *   * No `filter: blur()`. Soft light is a gradient or it does not exist.
 *   * Inline styles only. No stylesheet, no classes, no CSS variables.
 *   * Letter-spacing in px, never em — em support is unreliable, and every
 *     value here is the reference's em figure multiplied by its font size.
 *   * No `<br>`. Two lines means two elements.
 *   * `z-index` is ignored; stacking is document order, which is why the cover
 *     band is written before the body it sits behind.
 *
 * The reference only draws the story card. The link card reuses every part of
 * it at a wide-and-short scale — see LINK_DEVIATIONS at the bottom for the
 * three places that composition could not be preserved literally.
 */

/* Satori's <img> is not a DOM <img>: it is a node in a layout tree that gets
   rasterised server-side, so next/image has nothing to optimise and `alt` has
   nobody to read it. Both rules are about the browser, and none of this reaches
   one. */
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */

import { nameFontSize, nameLines } from "./nameLadder"
import { initials } from "./cardData"
import type { CardData, CardFormat } from "./types"
import { CARD_SIZES } from "./types"

// ── The reference's palette, verbatim ─────────────────────────

const INK = "#0A0A0A"
const GREEN = "#00C96E"
const GREEN_INK = "#06210f"
/** Muted body text — the handle and the footer URL. */
const MUTE = "#7A9480"
/** The dimmest legible tone — stat labels and the footer meta. */
const FAINT = "#556655"
const AVATAR_WELL = "#1a211b"
const MONOGRAM_WELL = "#1c2a20"
const HAIRLINE = "rgba(255,255,255,.09)"

const DISPLAY = "Bebas Neue"
const LABEL = "Oswald"
const BODY = "Outfit"

/**
 * The scrim over the cover.
 *
 * The story value is the reference's, and it works because the band ENDS at
 * the card's own black — the type below it sits on ink, not on photography.
 * The link card has no band; the cover is a full bleed with text over its whole
 * area, so the same gradient leaves the muted greys unreadable on a bright
 * photo. Its scrim is heavier and runs left-to-right, which keeps the type
 * legible and still lets the photograph show on the right where nothing sits.
 */
const COVER_SCRIMS: Record<CardFormat, string> = {
  story:
    "linear-gradient(to bottom, rgba(10,10,10,.45) 0%, rgba(10,10,10,.2) 45%, #0A0A0A 100%)",
  link: "linear-gradient(100deg, rgba(10,10,10,.97) 0%, rgba(10,10,10,.93) 52%, rgba(10,10,10,.62) 100%)",
}

/**
 * The no-cover fallback, and the fast path: pure CSS plus two inline polygons,
 * so it costs no network fetch inside the render. A large share of new signups
 * have no cover, which makes this a main path rather than an edge case.
 */
const PATTERN_GRADIENT =
  "linear-gradient(118deg,#101a13 0%,#17281c 42%,#0d130f 100%)"

// ── Per-format scale ──────────────────────────────────────────

/**
 * Every measurement the two formats disagree on.
 *
 * The link card is not a scaled-down story card: it is 1200 wide but only 630
 * tall, so height is the binding constraint and the type scale is set by what
 * fits vertically, not by a ratio.
 */
interface Scale {
  pad: number
  coverHeight: number
  markLogo: number
  markText: number
  avatar: number
  avatarBorder: number
  chipText: number
  chipPadV: number
  chipPadH: number
  handle: number
  statLabel: number
  statValue: number
  statGap: number
  clubMonogram: number
  clubName: number
  clubNote: number
  url: number
  meta: number
}

const SCALES: Record<CardFormat, Scale> = {
  story: {
    pad: 80,
    coverHeight: 520,
    markLogo: 60,
    markText: 44,
    avatar: 300,
    avatarBorder: 6,
    chipText: 24,
    chipPadV: 12,
    chipPadH: 26,
    handle: 36,
    statLabel: 20,
    statValue: 64,
    statGap: 70,
    clubMonogram: 62,
    clubName: 34,
    clubNote: 24,
    url: 30,
    meta: 20,
  },
  link: {
    pad: 56,
    coverHeight: CARD_SIZES.link.height,
    markLogo: 34,
    markText: 26,
    avatar: 300,
    avatarBorder: 5,
    chipText: 17,
    chipPadV: 7,
    chipPadH: 16,
    handle: 24,
    statLabel: 13,
    statValue: 40,
    statGap: 40,
    clubMonogram: 0,
    clubName: 21,
    clubNote: 17,
    url: 21,
    meta: 15,
  },
}

/** The reference's letter-spacings, which are all in em, resolved against the
 *  font size they apply to. */
const track = (size: number, em: number) => size * em

// ── Pieces ────────────────────────────────────────────────────

function GoatzaMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size}>
      <path
        fill={GREEN}
        fillRule="evenodd"
        d="M423.8 710.6C477.8 682.2 514.3 656.5 547.5 623.6C569.0 602.3 583.7 583.6 594.1 564.8L597.8 558.0L588.6 558.0C565.3 558.0 545.5 551.2 532.9 538.8C527.3 533.2 522.0 524.9 522.0 521.5C522.0 520.2 530.1 520.0 595.0 520.0C667.2 520.0 668.0 520.0 668.0 522.0C668.0 525.2 662.1 542.8 657.4 553.3C641.3 589.7 613.8 622.9 575.3 652.6C542.7 677.7 502.0 698.2 463.5 708.8C448.8 712.9 427.3 717.0 417.5 717.6L409.5 718.1L423.8 710.6ZM410.0 671.0C382.8 667.2 360.0 651.9 348.9 629.8C342.1 616.3 338.3 595.1 339.5 577.3C343.7 512.7 390.2 450.3 460.0 415.4C493.1 398.9 527.6 390.1 566.8 388.3C574.1 388.0 579.9 387.6 579.7 387.4C579.1 386.8 565.2 384.9 551.6 383.5C532.8 381.6 500.0 381.6 483.0 383.6C437.9 388.7 390.7 406.7 351.9 433.5C347.6 436.4 344.0 438.5 344.0 438.1C344.0 437.6 348.6 432.8 354.3 427.4C403.5 380.1 469.3 349.8 533.4 344.9C558.3 343.0 587.1 346.4 607.5 353.7C626.1 360.4 646.6 373.4 657.6 385.4C672.5 401.7 675.4 417.2 667.0 435.7L664.1 442.1L654.3 437.2C614.9 417.5 556.5 419.8 501.0 443.2C475.9 453.8 453.0 469.1 434.4 487.5C406.3 515.4 391.0 548.8 391.0 582.3C391.0 612.2 403.0 631.2 428.8 642.3C442.1 648.0 453.3 649.8 478.2 650.1C488.0 650.3 496.0 650.7 496.0 651.0C496.0 651.4 490.7 654.2 484.2 657.3C472.6 662.8 457.1 667.9 445.5 669.9C437.0 671.5 417.7 672.1 410.0 671.0ZM645.5 354.0C639.0 352.6 633.8 350.5 627.9 346.7C610.1 335.3 605.1 314.4 615.7 296.3C618.8 290.9 627.9 282.6 633.9 279.6C648.7 272.0 665.4 272.1 680.4 279.7C687.4 283.2 696.2 292.0 700.1 299.3C703.3 305.2 703.5 306.0 703.5 315.5C703.5 324.4 703.2 326.1 700.7 331.2C695.7 341.5 684.1 350.0 670.5 353.5C664.2 355.1 652.2 355.3 645.5 354.0Z"
      />
    </svg>
  )
}

function Tick({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path
        d="M20 6L9 17l-5-5"
        stroke={GREEN}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Two low-opacity polygons over a dark diagonal gradient. Drawn at the story
 *  band's coordinates and stretched by the SVG viewBox for the link card. */
function BrandedPattern({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        display: "flex",
        background: PATTERN_GRADIENT,
      }}
    >
      <svg
        viewBox="0 0 1080 520"
        width={width}
        height={height}
        preserveAspectRatio="none"
      >
        <path
          d="M0 400 L400 150 L560 260 L900 60 L1080 150 L1080 520 L0 520 Z"
          fill={GREEN}
          opacity=".05"
        />
        <path
          d="M0 470 L300 300 L620 430 L1080 260 L1080 520 L0 520 Z"
          fill={GREEN}
          opacity=".04"
        />
      </svg>
    </div>
  )
}

function CoverBand({
  coverUrl,
  width,
  height,
  format,
}: {
  coverUrl: string | null
  width: number
  height: number
  format: CardFormat
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        display: "flex",
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          width={width}
          height={height}
          style={{ width, height, objectFit: "cover" }}
        />
      ) : (
        <BrandedPattern width={width} height={height} />
      )}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          background: COVER_SCRIMS[format],
        }}
      />
    </div>
  )
}

/**
 * The round medallion. Falls back to initials rather than a silhouette: a large
 * share of new signups have no photo, and two green letters on a dark well
 * looks deliberate where a generic avatar looks broken.
 */
function Avatar({
  url,
  name,
  size,
  border,
  marginTop,
}: {
  url: string | null
  name: string
  size: number
  border: number
  marginTop: number
}) {
  const inner = size - border * 2

  return (
    <div
      style={{
        width: size,
        height: size,
        marginTop,
        borderRadius: size,
        border: `${border}px solid ${GREEN}`,
        background: url ? AVATAR_WELL : MONOGRAM_WELL,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {url ? (
        <img
          src={url}
          width={inner}
          height={inner}
          style={{ width: inner, height: inner, objectFit: "cover", borderRadius: inner }}
        />
      ) : (
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: Math.round(size * 0.42),
            color: GREEN,
            letterSpacing: track(size * 0.42, 0.04),
          }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  )
}

function Chip({
  children,
  filled,
  scale,
}: {
  children: string
  filled: boolean
  scale: Scale
}) {
  return (
    <span
      style={{
        fontFamily: LABEL,
        fontSize: scale.chipText,
        textTransform: "uppercase",
        letterSpacing: track(scale.chipText, 0.16),
        padding: `${scale.chipPadV}px ${scale.chipPadH}px`,
        borderRadius: 999,
        background: filled ? GREEN : "transparent",
        color: filled ? GREEN_INK : "#fff",
        // Transparent rather than absent on the filled chip, so both sit on the
        // same baseline — Satori's box model is border-box, and a 1px border on
        // only one of them would shift it.
        border: `1px solid ${filled ? "transparent" : "rgba(255,255,255,.2)"}`,
      }}
    >
      {children}
    </span>
  )
}

function Stats({ data, scale }: { data: CardData; scale: Scale }) {
  return (
    <div style={{ display: "flex", gap: scale.statGap }}>
      {data.slots.map((slot) => (
        <div key={slot.key} style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: LABEL,
              fontSize: scale.statLabel,
              textTransform: "uppercase",
              letterSpacing: track(scale.statLabel, 0.18),
              color: FAINT,
            }}
          >
            {slot.label}
          </span>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: scale.statValue,
              textTransform: "uppercase",
              letterSpacing: track(scale.statValue, 0.02),
              marginTop: Math.round(scale.statValue * 0.125),
            }}
          >
            {slot.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The verified-club block. Rendered only when the player has a verified career
 * entry — an unverified card drops it entirely and lets the stats row sit
 * lower, because an empty state here would read as incomplete rather than
 * intentional.
 */
function Club({
  club,
  scale,
  format,
}: {
  club: NonNullable<CardData["club"]>
  scale: Scale
  format: CardFormat
}) {
  const note = (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(scale.clubNote * 0.3),
        fontFamily: BODY,
        fontSize: scale.clubNote,
        color: GREEN,
      }}
    >
      <Tick size={Math.round(scale.clubNote * 0.875)} />
      Verified by the club on Goatza
    </span>
  )

  const name = (
    <span
      style={{
        fontFamily: LABEL,
        fontSize: scale.clubName,
        letterSpacing: track(scale.clubName, 0.1),
        textTransform: "uppercase",
      }}
    >
      {club.name}
    </span>
  )

  // The link card has no room for the bordered box, so the same two lines run
  // inline. Same content, same colours, one row instead of a panel.
  if (format === "link") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginTop: 18,
        }}
      >
        {name}
        {note}
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        marginTop: 56,
        padding: "26px 32px",
        border: "1px solid rgba(0,201,110,.28)",
        background: "rgba(0,201,110,.07)",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          width: scale.clubMonogram,
          height: scale.clubMonogram,
          borderRadius: scale.clubMonogram,
          background: MONOGRAM_WELL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: LABEL,
          fontSize: Math.round(scale.clubMonogram * 0.4),
          color: GREEN,
          letterSpacing: track(scale.clubMonogram * 0.4, 0.06),
        }}
      >
        {club.monogram}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {name}
        {note}
      </div>
    </div>
  )
}

function Identity({
  data,
  scale,
  format,
}: {
  data: CardData
  scale: Scale
  format: CardFormat
}) {
  const size = nameFontSize(data.name, format)
  const lines = nameLines(data.name, format)
  const chips = [data.ageGroup, data.sport, data.position].filter(Boolean) as string[]

  // A real element, not a fragment. Satori turns a fragment into an anonymous
  // flex container with the default `row` direction, which silently lays the
  // whole identity block out sideways.
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {chips.length > 0 && (
        <div
          style={{
            display: "flex",
            // Without this the chips stretch to the tallest of them: every
            // Satori box is a flex item, so the browser's shrink-to-content
            // inline behaviour has to be asked for.
            alignItems: "center",
            gap: format === "story" ? 14 : 9,
            marginTop: format === "story" ? 44 : 20,
          }}
        >
          {chips.map((chip, i) => (
            <Chip key={chip} filled={i === 0 && data.ageGroup === chip} scale={scale}>
              {chip}
            </Chip>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontFamily: DISPLAY,
          fontSize: size,
          lineHeight: 0.82,
          letterSpacing: track(size, 0.005),
          marginTop: format === "story" ? 40 : 20,
        }}
      >
        {lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>

      <span
        style={{
          fontFamily: BODY,
          fontSize: scale.handle,
          color: MUTE,
          marginTop: format === "story" ? 28 : 12,
        }}
      >
        @{data.username}
      </span>

      <div
        style={{
          height: 1,
          background: HAIRLINE,
          marginTop: format === "story" ? 46 : 20,
        }}
      />

      <div style={{ display: "flex", marginTop: format === "story" ? 46 : 20 }}>
        <Stats data={data} scale={scale} />
      </div>

      {data.club && <Club club={data.club} scale={scale} format={format} />}
    </div>
  )
}

function Footer({ data, scale }: { data: CardData; scale: Scale }) {
  return (
    <div
      style={{
        // Pins the footer to the bottom whatever the block above it came to —
        // a card with no club block is shorter, and the URL should not float up
        // with it.
        marginTop: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: LABEL,
          fontSize: scale.url,
          letterSpacing: track(scale.url, 0.16),
          color: MUTE,
        }}
      >
        goatza.com/{data.username}
      </span>
      <span
        style={{
          fontFamily: LABEL,
          fontSize: scale.meta,
          letterSpacing: track(scale.meta, 0.2),
          textTransform: "uppercase",
          color: FAINT,
        }}
      >
        {data.kindLabel}
      </span>
    </div>
  )
}

// ── The card ──────────────────────────────────────────────────

export default function ProfileCard({
  data,
  format,
}: {
  data: CardData
  format: CardFormat
}) {
  const { width, height } = CARD_SIZES[format]
  const scale = SCALES[format]

  const mark = (
    <div style={{ display: "flex", alignItems: "center", gap: format === "story" ? 14 : 10 }}>
      <GoatzaMark size={scale.markLogo} />
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: scale.markText,
          letterSpacing: track(scale.markText, 0.16),
        }}
      >
        GOATZA
      </span>
    </div>
  )

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: INK,
        color: "#fff",
        fontFamily: BODY,
        overflow: "hidden",
      }}
    >
      {/* Written first so the body paints over it — Satori stacks in document
          order and ignores z-index. */}
      <CoverBand
        coverUrl={data.coverUrl}
        width={width}
        height={scale.coverHeight}
        format={format}
      />

      {format === "story" ? (
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            padding: `${scale.pad}px ${scale.pad}px ${scale.pad}px`,
          }}
        >
          {mark}
          <Avatar
            url={data.avatarUrl}
            name={data.name}
            size={scale.avatar}
            border={scale.avatarBorder}
            marginTop={118}
          />
          <Identity data={data} scale={scale} format={format} />
          <Footer data={data} scale={scale} />
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexGrow: 1,
            padding: scale.pad,
            gap: 44,
          }}
        >
          <Avatar
            url={data.avatarUrl}
            name={data.name}
            size={scale.avatar}
            border={scale.avatarBorder}
            marginTop={0}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              height: "100%",
            }}
          >
            {mark}
            <Identity data={data} scale={scale} format={format} />
            <Footer data={data} scale={scale} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * LINK_DEVIATIONS — where the 1200×630 card could not follow the reference
 * literally, and what was preserved instead. The reference only draws the story
 * card; these are the three judgement calls, kept as small as possible.
 *
 *   1. The cover is a full bleed, not a top band. A 520px band inside a 630px
 *      frame leaves 110px for everything else. The scrim and the dark base are
 *      unchanged, so it reads as the same treatment.
 *   2. The avatar sits to the LEFT of the text rather than above it. A column
 *      does not fit in 630px; the medallion, its 6px green ring and the type
 *      scale are otherwise the reference's.
 *   3. The club panel becomes an inline row — same name, same tick, same green,
 *      no border box. The panel's 26px padding and 56px top margin are a third
 *      of the card's height.
 */
