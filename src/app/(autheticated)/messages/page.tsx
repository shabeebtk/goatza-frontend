import type { Metadata } from "next"
import ConversationsList from "@/features/messages/components/ConversationsList/ConversationsList"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "Messages · Goatza",
}

export default function MessagesPage() {
  return (
    <ConversationsList />
  )
}