/**
 * Test config for the frontend.
 *
 * Node environment by DEFAULT, not jsdom. The bulk of what's under test is pure
 * (slot validation, the name ladder, Cloudinary transforms, eligibility) or
 * renders through Satori on the server, and paying jsdom's start-up for every
 * one of those files is a tax on the common case.
 *
 * Component tests opt in per file with a `@vitest-environment jsdom` docblock
 * on line one. That's the per-file escape hatch rather than a global switch on
 * purpose: it keeps the default cheap, and it makes "this file needs a DOM"
 * something you read at the top of the file instead of inferring from a glob
 * in here.
 */

import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    /**
     * The render tests rasterise real 1080×1920 PNGs through Satori — roughly a
     * second and a half each on a warm machine, and several suites do it at
     * once, so the binding cost is CPU contention rather than any one render.
     * The 5s default was already marginal and started tipping over when the
     * card gained its QR footer. Generous rather than tuned: a flaky timeout in
     * this suite reads as "the card broke", which is the wrong signal.
     */
    testTimeout: 30_000,
  },
})
