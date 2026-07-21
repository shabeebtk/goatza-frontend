import ChatWindow from "@/features/messages/components/ChatWindow/ChatWindow"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params

  // key={id} — a different conversation is a different chat, not a re-render:
  // remounting resets the scroll controller cleanly.
  return <ChatWindow key={id} conversationId={id} />
}