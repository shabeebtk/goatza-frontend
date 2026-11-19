// ─────────────────────────────────────────────────────────────
// Settings → notifications (the person's enquiry emails, per org)
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"
import EnquiryEmailSettingsPage from "@/features/enquiries/components/EnquiryEmailSettingsPage/EnquiryEmailSettingsPage"

export const metadata: Metadata = {
  title: "Notifications · Goatza",
}

export default function NotificationSettingsRoute() {
  return <EnquiryEmailSettingsPage />
}
