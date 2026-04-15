"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { useGetOrCreateConversation } from "@/features/messages/hooks/useConversationQueries"
import styles from "./MessageResolver.module.css"

interface MessageResolverProps {
  username: string
}

export default function MessageResolver({ username }: MessageResolverProps) {
  const router = useRouter()
  const { mutate: getOrCreate, isError, isPending } = useGetOrCreateConversation()

  useEffect(() => {
    if (!username) return
    getOrCreate(username, {
      onSuccess: (data) => {
        router.replace(`/chat/${data.conversation_id}`)
      },
    })
  }, [username]) // eslint-disable-line

  if (isError) {
    return (
      <div className={styles.state}>
        <div className={styles.errorIcon}>
          <Icon icon="mdi:message-off-outline" width={40} height={40} />
        </div>
        <p className={styles.errorTitle}>Can't open conversation</p>
        <p className={styles.errorBody}>
          This user may not exist or messaging is unavailable.
        </p>
        <button
          className={styles.backBtn}
          onClick={() => router.push("/messages")}
          type="button"
        >
          <Icon icon="mdi:arrow-left" width={16} height={16} />
          Back to Messages
        </button>
      </div>
    )
  }

  return (
    <div className={styles.state}>
      <div className={styles.spinnerWrap}>
        <span className={styles.spinner} />
        <span className={styles.spinnerRing} />
      </div>
      <p className={styles.loadingText}>Opening conversation…</p>
    </div>
  )
}