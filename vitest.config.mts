/**
 * Test config for the share-card logic.
 *
 * Node environment, not jsdom: everything under test either is pure (slot
 * validation, the name ladder, Cloudinary transforms) or renders through Satori
 * on the server. Nothing here needs a DOM, and a jsdom that nothing uses is
 * just a slower start-up.
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
