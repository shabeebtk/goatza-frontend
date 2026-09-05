import type { NextConfig } from "next";
// v10 moved this off the main entry point; importing it from "@sentry/nextjs"
// still works but is deprecated and is removed in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

const isProd = process.env.NODE_ENV === "production"

/**
 * Host of the public media domain, for `images.remotePatterns`.
 *
 * Hard failure rather than a fallback: next/image refuses any host that is not
 * listed, so a missing or malformed var would build cleanly and then render
 * every avatar, post photo and chat bubble as a broken image in production.
 * Failing the build is the cheaper way to find out.
 */
function mediaHost(): string {
  const raw = process.env.NEXT_PUBLIC_MEDIA_BASE_URL

  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_MEDIA_BASE_URL is not set. It is the public origin media is " +
      "served from (production: https://media.goatza.com; local dev: your " +
      "bucket's https://pub-<id>.r2.dev URL). Add it to .env.local — see " +
      ".env.local.example — and to the deployment's environment variables."
    )
  }

  try {
    return new URL(raw).hostname
  } catch {
    throw new Error(
      `NEXT_PUBLIC_MEDIA_BASE_URL is not a valid absolute URL: "${raw}". ` +
      "It must include the scheme, e.g. https://media.goatza.com"
    )
  }
}

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: mediaHost(),
      },
    ],
  },
  typescript: {
    tsconfigPath: isProd ? "tsconfig.build.json" : "tsconfig.json",
  },

  // The share-card renderer reads its three font files off disk at render time.
  // Next's tracer usually finds them from the literal join() in
  // features/profile/utils/shareCard/fonts.ts, but a missed trace means every
  // OG image in production renders in a fallback face — cheap insurance.
  outputFileTracingIncludes: {
    "/api/card/profile/[username]": ["./public/fonts/**"],
  },
}

/**
 * Sentry wraps the finished config rather than replacing any of it.
 *
 * Order matters and is safe: mediaHost() runs while the object literal above
 * is being built, so a missing NEXT_PUBLIC_MEDIA_BASE_URL still throws before
 * this wrapper is ever called — the build-time check is untouched.
 */
export default withSentryConfig(nextConfig, {
  // No SENTRY_AUTH_TOKEN yet, so there is nothing to upload to. Turning this
  // off is what stops the plugin warning about the missing token on every
  // build; `silent` then keeps the rest of its build chatter out of CI logs.
  sourcemaps: { disable: true },
  silent: true,

  // Nothing here is wired to a Sentry org yet, so the plugin has no reason to
  // make its own network calls during a build.
  telemetry: false,
});
