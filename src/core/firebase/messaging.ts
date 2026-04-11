import { getMessaging, getToken, onMessage } from "firebase/messaging"
import { app } from "./firebase"

export const messaging = getMessaging(app)

// Get FCM token
export const getFCMToken = async () => {
  try {
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
export const onForegroundMessage = (callback: (payload: any) => void) => {
  return onMessage(messaging, callback)
}