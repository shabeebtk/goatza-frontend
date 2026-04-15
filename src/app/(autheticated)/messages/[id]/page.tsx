import ChatWindow from "@/features/messages/components/ChatWindow/ChatWindow"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params

  return <ChatWindow conversationId={id} />
}