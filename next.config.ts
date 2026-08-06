import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production"

const nextConfig = {
  images: {
    remotePatterns: [
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
