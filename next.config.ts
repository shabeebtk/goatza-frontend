import type { NextConfig } from "next";

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
      // TODO(cleanup-stage): drop this once no row still points at Cloudinary.
      // Media uploaded before the R2 migration is still served from here, and
      // removing the pattern would break every one of those images.
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
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
export default nextConfig;
