export const dynamic = "force-dynamic"

import SelectRolePage from "@/features/auth/SelectRolePage"

// The light page background (--color-bg). A server export cannot know which
// theme this browser chose — that lives in localStorage, read by the theme
// store on the client — so the status bar here is tinted for the default and
// is a shade off for a dark-theme user until they reach an in-app layout,
// which renders the store-driven <ThemeColorMeta />. A media-query pair would
// be wrong rather than approximate: it would follow the OS, which the theme
// no longer does.
export const viewport = {
  themeColor: "#f5f7f5",
}

export default function Page() {
  return <SelectRolePage />
}
