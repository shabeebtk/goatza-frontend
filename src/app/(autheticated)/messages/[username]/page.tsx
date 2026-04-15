import MessageResolver from "@/features/messages/components/MessageResolver/MessageResolver"

interface Props {
  params: Promise<{ username: string }>
}

export default async function MessageUsernamePage({ params }: Props) {
  const { username } = await params
  return <MessageResolver username={username} />
}