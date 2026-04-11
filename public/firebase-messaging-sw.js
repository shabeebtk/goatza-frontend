importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js")

firebase.initializeApp({
  apiKey: "AIzaSyBr69AZcYTqtf1jeJRMztlkKEi3dROG5zM",
  authDomain: "goatza-dev.firebaseapp.com",
  projectId: "goatza-dev",
  messagingSenderId: "283026200880",
  appId: "1:283026200880:web:aace3c8e6c4bb57c1350f5",
})

const messaging = firebase.messaging()

// BACKGROUND MESSAGE
messaging.onBackgroundMessage((payload) => {
  console.log(" Background message:", payload)

  const data = payload.data || {}

  const title = data.title || "Goatza"
  const options = {
    body: data.body || "New notification",
    icon: data.actor_avatar || "/icon-192.png",
    data: {
      url: data.url || "/", // 🔥 important for click
    },
  }

  self.registration.showNotification(title, options)
})

// CLICK HANDLER (VERY IMPORTANT)
self.addEventListener("notificationclick", function (event) {
  event.notification.close()

  const url = event.notification.data?.url || "/"

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})