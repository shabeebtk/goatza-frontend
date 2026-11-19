import { qrShape } from "@/features/profile/utils/shareCard/qr"
import { formatAges, pageShareText, pageShareUrl } from "../format"

/**
 * The page's printable poster: an A4 PNG drawn on a canvas, with the page's QR.
 *
 * - The words are decided by `posterLines`, which is pure and tested; the canvas
 *   only draws what it is given.
 * - Fonts are the self-hosted files in /public/fonts, loaded with FontFace under
 *   names of our own and awaited before drawing. next/font's hashed families are
 *   never used: they are not guaranteed to be loaded, or even named the same.
 * - The logo is loaded with crossOrigin="anonymous". If it fails to load, or
 *   would taint the canvas (so it could never be exported), a dark tile with the
 *   initials in brand green stands in.
 * - The QR is black on white in both themes: a dark-mode inversion scans as a
 *   different symbol for most readers.
 */

export type PosterTheme = "light" | "dark"

export type PosterInput = {
  orgName: string
  username: string
  logoUrl?: string | null
  primarySport?: string | null
  ageMin?: number | null
  ageMax?: number | null
  primaryCity?: string | null
  enquiryFormOn: boolean
}

export type PosterLines = {
  name: string
  initials: string
  /** "Football coaching · Ages 8 – 12 · Thrissur", missing parts skipped; "" when none. */
  facts: string
  /** One or two lines; `accent` is the one drawn in brand green. */
  headline: { text: string; accent: boolean }[]
  instruction: string
  /** What the QR encodes: the vanity URL. */
  qrText: string
  /** The URL as printed, without the scheme. */
  url: string
  wordmark: string
}

export function posterInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)
  return letters.toUpperCase() || "G"
}

/** Every line of text the poster draws, in order. */
export function posterLines(input: PosterInput): PosterLines {
  const sport = (input.primarySport ?? "").trim()
  const facts = [
    sport ? `${sport} coaching` : "",
    formatAges(input.ageMin ?? null, input.ageMax ?? null),
    (input.primaryCity ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" · ")

  return {
    name: input.orgName.trim(),
    initials: posterInitials(input.orgName),
    facts,
    headline: input.enquiryFormOn
      ? [
          { text: "WANT TO JOIN?", accent: false },
          { text: "SCAN TO ENQUIRE", accent: true },
        ]
      : [{ text: "SCAN TO SEE OUR PAGE", accent: true }],
    instruction: "Point your phone camera at the code",
    qrText: pageShareUrl(input.username),
    url: pageShareText(input.username),
    wordmark: "GOATZA",
  }
}

// ── Drawing ───────────────────────────────────────────────────

/** A4 portrait at 300 dpi: prints sharp at A4. */
export const POSTER_WIDTH = 2480
export const POSTER_HEIGHT = 3508

const QR_CARD = 1150
const QUIET_MODULES = 4
const MAX_TEXT_WIDTH = 2080

const FONTS = {
  display: "GoatzaPosterBebas",
  label: "GoatzaPosterOswald",
  body: "GoatzaPosterOutfit",
}

const PALETTE: Record<PosterTheme, { ground: string; text: string; muted: string; accent: string; border: string }> = {
  // Brand green-700 on white: the lighter greens are too faint to print.
  light: { ground: "#ffffff", text: "#0a0a0a", muted: "#3d5242", accent: "#007a3d", border: "#d5dcd6" },
  dark: { ground: "#0d110e", text: "#ffffff", muted: "#b0bfb0", accent: "#4dd68c", border: "#0d110e" },
}

let fontsReady: Promise<void> | null = null

/** The three poster fonts, loaded once per page load and awaited before drawing. */
export function loadPosterFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  const faces = [
    new FontFace(FONTS.display, "url(/fonts/bebas-neue-400.ttf)", { weight: "400" }),
    new FontFace(FONTS.label, "url(/fonts/oswald-500.ttf)", { weight: "500" }),
    new FontFace(FONTS.body, "url(/fonts/outfit-400.ttf)", { weight: "400" }),
  ]
  fontsReady = Promise.all(
    faces.map(async (face) => {
      const loaded = await face.load()
      document.fonts.add(loaded)
    })
  ).then(
    () => undefined,
    (err) => {
      fontsReady = null
      throw err
    }
  )
  return fontsReady
}

/** The logo, only if it can be drawn AND exported; null means "use the initials tile". */
function loadLogo(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      try {
        // A probe: reading pixels throws if the image would taint the canvas.
        const probe = document.createElement("canvas")
        probe.width = 1
        probe.height = 1
        const ctx = probe.getContext("2d")
        ctx?.drawImage(image, 0, 0, 1, 1)
        ctx?.getImageData(0, 0, 1, 1)
        resolve(image)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The name in at most two lines, shrinking the size until it fits. */
function fitName(ctx: CanvasRenderingContext2D, name: string): { size: number; lines: string[] } {
  const words = name.split(/\s+/).filter(Boolean)
  for (let size = 250; size >= 120; size -= 10) {
    ctx.font = `400 ${size}px ${FONTS.display}`
    const lines: string[] = []
    let line = ""
    let fits = true
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= MAX_TEXT_WIDTH) {
        line = next
      } else {
        if (ctx.measureText(word).width > MAX_TEXT_WIDTH) fits = false
        if (line) lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    if (fits && lines.length <= 2) return { size, lines }
  }
  // Still too long at the smallest size: two lines, the second cut short.
  ctx.font = `400 120px ${FONTS.display}`
  let first = ""
  const rest = [...words]
  while (rest.length && ctx.measureText(first ? `${first} ${rest[0]}` : rest[0]).width <= MAX_TEXT_WIDTH) {
    first = first ? `${first} ${rest.shift()}` : (rest.shift() as string)
  }
  let second = rest.join(" ")
  while (second && ctx.measureText(`${second}…`).width > MAX_TEXT_WIDTH) second = second.slice(0, -1)
  return { size: 120, lines: [first || name.slice(0, 20), second ? `${second.trimEnd()}…` : ""].filter(Boolean) }
}

/** Draws the poster and resolves with it as a PNG. */
export async function pagePosterPng(input: PosterInput, theme: PosterTheme = "light"): Promise<Blob> {
  const lines = posterLines(input)
  const colors = PALETTE[theme]
  const [, logo] = await Promise.all([loadPosterFonts(), loadLogo(input.logoUrl)])

  const canvas = document.createElement("canvas")
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't draw the poster on this device.")

  ctx.fillStyle = colors.ground
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  const centre = POSTER_WIDTH / 2

  // Measure first, so the whole stack sits centred on the page.
  const name = fitName(ctx, lines.name)
  const LOGO = 340
  const nameLine = Math.round(name.size * 0.95)
  const blocks = {
    logo: LOGO,
    gapLogo: 100,
    name: nameLine * name.lines.length,
    gapName: lines.facts ? 50 : 0,
    facts: lines.facts ? 80 : 0,
    gapFacts: 120,
    headline: 215 * lines.headline.length,
    gapHeadline: 90,
    qr: QR_CARD,
    gapQr: 100,
    instruction: 70,
    gapInstruction: 40,
    url: 100,
    gapUrl: 150,
    wordmark: 90,
  }
  const total = Object.values(blocks).reduce((sum, value) => sum + value, 0)
  let y = Math.max(140, Math.round((POSTER_HEIGHT - total) / 2))

  // The logo, or the initials tile.
  const logoX = centre - LOGO / 2
  ctx.save()
  roundedRect(ctx, logoX, y, LOGO, LOGO, 72)
  ctx.clip()
  if (logo) {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(logoX, y, LOGO, LOGO)
    const scale = Math.max(LOGO / logo.naturalWidth, LOGO / logo.naturalHeight)
    const w = logo.naturalWidth * scale
    const h = logo.naturalHeight * scale
    ctx.drawImage(logo, centre - w / 2, y + LOGO / 2 - h / 2, w, h)
  } else {
    ctx.fillStyle = "#0d110e"
    ctx.fillRect(logoX, y, LOGO, LOGO)
    ctx.fillStyle = "#4dd68c"
    ctx.font = `400 170px ${FONTS.display}`
    ctx.textBaseline = "middle"
    ctx.fillText(lines.initials, centre, y + LOGO / 2 + 8)
    ctx.textBaseline = "alphabetic"
  }
  ctx.restore()
  y += blocks.logo + blocks.gapLogo

  // The name.
  ctx.fillStyle = colors.text
  ctx.font = `400 ${name.size}px ${FONTS.display}`
  for (const line of name.lines) {
    y += nameLine
    ctx.fillText(line, centre, y - Math.round(nameLine * 0.12))
  }

  // Sport, ages, city.
  if (lines.facts) {
    y += blocks.gapName + blocks.facts
    ctx.fillStyle = colors.muted
    ctx.font = `400 64px ${FONTS.body}`
    ctx.fillText(lines.facts, centre, y - 12, MAX_TEXT_WIDTH)
  }
  y += blocks.gapFacts

  // The headline.
  ctx.font = `400 210px ${FONTS.display}`
  for (const line of lines.headline) {
    y += 215
    ctx.fillStyle = line.accent ? colors.accent : colors.text
    ctx.fillText(line.text, centre, y - 20, MAX_TEXT_WIDTH)
  }
  y += blocks.gapHeadline

  // The QR on its white card, with the four-module quiet zone inside the card.
  const qr = qrShape(lines.qrText)
  const cardX = centre - QR_CARD / 2
  ctx.fillStyle = "#ffffff"
  roundedRect(ctx, cardX, y, QR_CARD, QR_CARD, 48)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = colors.border
  ctx.stroke()
  const modulePx = QR_CARD / (qr.size + QUIET_MODULES * 2)
  ctx.save()
  ctx.translate(cardX + modulePx * QUIET_MODULES, y + modulePx * QUIET_MODULES)
  ctx.scale(modulePx, modulePx)
  ctx.fillStyle = "#000000"
  ctx.fill(new Path2D(qr.d))
  ctx.restore()
  y += blocks.qr + blocks.gapQr

  ctx.fillStyle = colors.muted
  ctx.font = `400 60px ${FONTS.body}`
  y += blocks.instruction
  ctx.fillText(lines.instruction, centre, y - 10, MAX_TEXT_WIDTH)

  y += blocks.gapInstruction + blocks.url
  ctx.fillStyle = colors.text
  ctx.font = `500 92px ${FONTS.label}`
  ctx.fillText(lines.url, centre, y - 12, MAX_TEXT_WIDTH)

  y += blocks.gapUrl + blocks.wordmark
  ctx.fillStyle = colors.muted
  ctx.font = `400 84px ${FONTS.display}`
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "12px"
  ctx.fillText(lines.wordmark, centre, Math.min(y, POSTER_HEIGHT - 120))

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Couldn't make the poster on this device."))
    }, "image/png")
  })
}
