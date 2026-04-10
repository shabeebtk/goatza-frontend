import type { Metadata } from "next"
import NotificationsList from "@/features/Notifications/components/NotificationsList/NotificationsList"

export const metadata: Metadata = {
  title: "Notifications · Goatza",
}

export default function NotificationsPage() {
  return (
    <NotificationsList />
  )
}