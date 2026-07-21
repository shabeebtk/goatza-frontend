import ChatWindow from "@/features/messages/components/ChatWindow/ChatWindow"

interface Props {
  params: Promise<{ chatId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { chatId } = await params

  // key={chatId} — a different conversation is a different chat, not a
  // re-render: remounting resets the scroll controller cleanly.
  return <ChatWindow key={chatId} conversationId={chatId} />
}
