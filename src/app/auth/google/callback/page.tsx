export const dynamic = "force-dynamic"

import ClientGoogleCallback from "@/features/auth/components/SocialAuth/ClientGoogleCallback"

// The light page background (--color-bg). A server export cannot know which
// theme this browser chose — see auth/select-role/page.tsx for the full note;
// the same limitation and the same choice apply here.
export const viewport = {
  themeColor: "#f5f7f5",
};

export default function Page() {
  return <ClientGoogleCallback />
}