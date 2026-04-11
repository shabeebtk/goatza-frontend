import { getFCMToken, onForegroundMessage } from "./messaging"

// Initialize FCM
export const initFCM = async () => {
  try {
    const permission = await Notification.requestPermission()

    if (permission !== "granted") {
      console.log("Notification permission denied")
      return null
    }

    const token = await getFCMToken()

    return token
  } catch (error) {
    console.error("FCM init error:", error)
    return null
  }
}