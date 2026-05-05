import type { Metadata } from "next"
import ConversationsList from "@/features/messages/components/ConversationsList/ConversationsList"

export const metadata: Metadata = {
  title: "Messages · Goatza",
}

export default function OrganizationMessagesPage() {
  return (
    <ConversationsList />
  )
}
