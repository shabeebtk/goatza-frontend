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
  },
})
