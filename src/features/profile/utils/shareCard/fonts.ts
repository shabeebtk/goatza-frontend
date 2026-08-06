/**
 * The three faces the card is drawn in, as ArrayBuffers for `ImageResponse`.
 *
 * Self-hosted, not fetched from Google at render time: an outage at a third
 * party must never be able to break the OG image on every shared profile link.
 * They live in `public/fonts/` as Latin+digits+punctuation subsets — the full
 * families are several hundred KB each and none of the extra glyphs can appear
 * on a card.
 *
 * TrueType, not woff2: Satori cannot read woff2. `scripts/fetch-card-fonts.mjs`
 * regenerates them.
 *
 * Read once per process and held in a module-level promise. A warm lambda
 * serving a link that is doing the rounds in a group chat should touch the disk
 * once, not once per request.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

export interface CardFont {
  name: string
  data: ArrayBuffer
  weight: 400 | 500
  style: "normal"
}

const FACES = [
  { name: "Bebas Neue", file: "bebas-neue-400.ttf", weight: 400 },
  { name: "Oswald", file: "oswald-500.ttf", weight: 500 },
  { name: "Outfit", file: "outfit-400.ttf", weight: 400 },
] as const

let cached: Promise<CardFont[]> | null = null

export function cardFonts(): Promise<CardFont[]> {
  cached ??= Promise.all(
    FACES.map(async (face) => {
      // A literal path segment, so Next's file tracer can see it and include
      // the fonts in the deployed function. `outputFileTracingIncludes` in
      // next.config.ts pins them belt-and-braces.
      const buffer = await readFile(join(process.cwd(), "public", "fonts", face.file))

      return {
        name: face.name,
        data: buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer,
        weight: face.weight,
        style: "normal" as const,
      }
    })
  )

  return cached
}
