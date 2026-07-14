export const dynamic = "force-dynamic"

import ClientGoogleCallback from "@/features/auth/components/SocialAuth/ClientGoogleCallback"

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d110e" },
  ],
};

export default function Page() {
  return <ClientGoogleCallback />
}