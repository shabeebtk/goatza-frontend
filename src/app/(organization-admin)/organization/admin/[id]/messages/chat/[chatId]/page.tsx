import ChatWindow from "@/features/messages/components/ChatWindow/ChatWindow"

interface Props {
  params: Promise<{ chatId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { chatId } = await params

  return <ChatWindow conversationId={chatId} />
}
