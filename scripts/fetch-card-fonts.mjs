/**
 * Regenerate the share card's three font subsets into public/fonts/.
 *
 *   npm run fonts:card
 *
 * The card is drawn in the same three faces as the app — Bebas Neue for
 * display, Oswald 500 for labels, Outfit 400 for body — but Satori cannot read
 * a woff2 and must not depend on a third party at render time, so they are
 * self-hosted TrueType.
 *
 * Two things this leans on Google's CSS2 API for, both of which save a build
 * dependency:
 *
 *   * `text=` returns a font subset to exactly those glyphs. That is why three
 *     families come to ~77KB rather than several hundred each, and it means no
 *     fonttools in the toolchain.
 *   * An ancient User-Agent is what makes it answer with TrueType. A modern one
 *     gets woff2 (Satori cannot parse it) and an MSIE one gets EOT.
 *
 * Committed output, run rarely. If a card ever renders tofu, the character is
 * missing from CHARSET below.
 */

import { writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts")

/**
 * ASCII printable, Latin-1 Supplement letters, and the typographic marks a card
 * can emit.
 *
 * Latin-1 is not optional: names are the main thing on this card and "José",
 * "Müller" and "Nuñez" are ordinary ones. Anything outside it — Malayalam,
 * Arabic, CJK — is out of scope for a Latin-subset card and would need its own
 * face rather than a wider subset of these.
 */
function charset() {
  const codePoints = []
  for (let c = 0x20; c <= 0x7e; c++) codePoints.push(c)
  for (let c = 0xc0; c <= 0xff; c++) codePoints.push(c)
  for (const char of "–—‘’“”·°×…") codePoints.push(char.codePointAt(0))

  return codePoints.map((c) => String.fromCodePoint(c)).join("")
}

const FACES = [
  { family: "Bebas Neue", weight: 400, file: "bebas-neue-400.ttf" },
  { family: "Oswald", weight: 500, file: "oswald-500.ttf" },
  { family: "Outfit", weight: 400, file: "outfit-400.ttf" },
]

const UA =
  "Mozilla/5.0 (Linux; U; Android 2.3.7; en-us; Nexus One Build/FRF91)" +
  " AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"

const TEXT = encodeURIComponent(charset())

async function fetchFace({ family, weight, file }) {
  const familyParam = family.replace(/ /g, "+")
  // Bebas Neue ships one weight and rejects a wght axis.
  const spec = family === "Bebas Neue" ? familyParam : `${familyParam}:wght@${weight}`

  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${spec}&text=${TEXT}`, {
      headers: { "User-Agent": UA },
    })
  ).text()

  const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
  if (!url) throw new Error(`${family}: no src in the returned CSS\n${css}`)

  const buffer = Buffer.from(
    await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer()
  )

  // 0x00010000 and "true" are TrueType; "OTTO" is CFF-flavoured OpenType, which
  // Satori also reads. "wOF2" means the User-Agent trick has stopped working
  // and the fonts would silently fail to load at render time.
  const tag = buffer.subarray(0, 4)
  const signature = tag.toString("latin1")
  const isFont =
    tag.readUInt32BE(0) === 0x00010000 || signature === "true" || signature === "OTTO"

  if (!isFont) {
    throw new Error(`${family}: expected TrueType/OpenType, got ${JSON.stringify(signature)}`)
  }

  await writeFile(join(OUT, file), buffer)
  console.log(`${file.padEnd(22)} ${(buffer.length / 1024).toFixed(1)} KB`)
}

await mkdir(OUT, { recursive: true })
for (const face of FACES) await fetchFace(face)
