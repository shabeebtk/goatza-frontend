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

  // The backend resolves this against the recipient's route space, so it is
  // navigated to verbatim — the worker builds no paths of its own.
  const url = event.notification.data?.url || "/notifications"

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const targetPath = new URL(url, self.location.origin).pathname

        // Pathnames, not client.url.includes(url): that compared a full href
        // against a path, so "/" matched every open tab while a deep path
        // matched none.
        const openTabs = clientList.filter(
          (client) =>
            "focus" in client &&
            new URL(client.url).origin === self.location.origin
        )

        // A tab already on the target page if there is one; otherwise any tab
        // of this app, which is navigated below rather than left where it was.
        const target =
          openTabs.find(
            (client) => new URL(client.url).pathname === targetPath
          ) ?? openTabs[0]

        if (!target) {
          return clients.openWindow ? clients.openWindow(url) : undefined
        }

        // navigate() BEFORE focus(): focusing a tab parked on /home and leaving
        // it there is what made a background push look like it did nothing.
        // navigate() rejects on a detached client, so fall back to a new window.
        return Promise.resolve(target.navigate ? target.navigate(url) : null)
          .then((navigated) => (navigated || target).focus())
          .catch(() => (clients.openWindow ? clients.openWindow(url) : undefined))
      })
  )
})