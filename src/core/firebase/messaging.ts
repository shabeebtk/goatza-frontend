import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging"
import { app } from "./firebase"

let messagingInstance: ReturnType<typeof getMessaging> | null = null

// messaging getter
const getMessagingInstance = async () => {
  if (typeof window === "undefined") return null

  // Check browser support 
  const supported = await isSupported()
  if (!supported) {
    console.warn("Firebase messaging not supported in this browser")
    return null
  }

  if (!messagingInstance) {
    messagingInstance = getMessaging(app)
  }

  return messagingInstance
}

// Get FCM token
export const getFCMToken = async () => {
  try {
    const messaging = await getMessagingInstance()
    if (!messaging) return null

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    })

    return token
  } catch (error) {
    console.error("FCM token error:", error)
    return null
  }
}

// Foreground listener
export const onForegroundMessage = async (
  callback: (payload: any) => void
) => {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}

  return onMessage(messaging, callback)
}