export const dynamic = "force-dynamic"

import ClientGoogleCallback from "@/features/auth/components/SocialAuth/ClientGoogleCallback"

export const viewport = {
  themeColor: "#000000",
};

export default function Page() {
  return <ClientGoogleCallback />
}