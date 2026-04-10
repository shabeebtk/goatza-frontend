import { ToastPosition, useToast } from "@/shared/components/ui/Toast/Toast"

function ToastDemoInner() {
  const toast = useToast()
 
  // ── Example 1: Instagram-style follow notification (avatar)
  const showFollowNotif = () => {
    toast.show({
      title: "Nazal ch started following you",
      avatarSrc: "https://res.cloudinary.com/duotwo8gf/image/upload/v1775291391/users/019d491b-f1aa-75e5-8895-bb2c65453cfe/profile/profile.webp",
      avatarInitials: "NC",
      position: "top-right",
      duration: 4000,
      action: {
        label: "View Profile",
        onClick: () => console.log("Navigate to profile"),
      },
    })
  }
 
  // ── Example 2: Like notification
  const showLikeNotif = () => {
    toast.show({
      title: "Nazal ch liked your post",
      message: '"great game today ❤️"',
      avatarSrc: "https://res.cloudinary.com/duotwo8gf/image/upload/v1775291391/users/019d491b-f1aa-75e5-8895-bb2c65453cfe/profile/profile.webp",
      avatarInitials: "NC",
      position: "top-right",
      duration: 4000,
    })
  }
 
  // ── Example 3: Comment notification
  const showCommentNotif = () => {
    toast.show({
      title: "rahul commented on your post",
      message: '"great ❤️"',
      icon: "mdi:comment",
      variant: "info",
      position: "top-right",
      duration: 5000,
      action: {
        label: "Reply",
        onClick: () => console.log("Navigate to post"),
      },
    })
  }
 
  // ── Example 4: Success toast
  const showSuccess = () => {
    toast.show({
      title: "Post published!",
      message: "Your post is now live.",
      variant: "success",
      position: "bottom-center",
      duration: 3000,
    })
  }
 
  // ── Example 5: Error toast
  const showError = () => {
    toast.show({
      title: "Upload failed",
      message: "File size too large. Max 10MB allowed.",
      variant: "error",
      position: "top-center",
      duration: 5000,
    })
  }
 
  // ── Example 6: Warning toast
  const showWarning = () => {
    toast.show({
      title: "Session expiring soon",
      message: "You'll be logged out in 5 minutes.",
      variant: "warning",
      position: "bottom-right",
      duration: 6000,
    })
  }
 
  // ── Example 7: All positions demo
  const showAllPositions = () => {
    const positions: ToastPosition[] = [
      "top-left", "top-center", "top-right",
      "bottom-left", "bottom-center", "bottom-right",
    ]
    positions.forEach((position, i) => {
      setTimeout(() => {
        toast.show({
          title: position,
          message: "Toast at this position",
          position,
          duration: 4000,
        })
      }, i * 200)
    })
  }
 
  // ── Example 8: Persistent toast (no auto-dismiss)
  const showPersistent = () => {
    const id = toast.show({
      title: "New message from Nazal",
      message: "Hey, great game today! Want to connect?",
      icon: "mdi:message",
      variant: "info",
      position: "top-right",
      duration: 0, // ← 0 = never auto-dismiss
      action: {
        label: "View",
        onClick: () => {
          toast.dismiss(id)
          console.log("Open messages")
        },
      },
    })
  }
 
  return (
    <div style={{ padding: "2rem", display: "flex", flexWrap: "wrap", gap: "1rem" }}>
      <button onClick={showFollowNotif}>Follow Notification</button>
      <button onClick={showLikeNotif}>Like Notification</button>
      <button onClick={showCommentNotif}>Comment Notification</button>
      <button onClick={showSuccess}>Success</button>
      <button onClick={showError}>Error</button>
      <button onClick={showWarning}>Warning</button>
      <button onClick={showAllPositions}>All Positions</button>
      <button onClick={showPersistent}>Persistent (no dismiss)</button>
      <button onClick={() => toast.dismissAll()}>Dismiss All</button>
    </div>
  )
}

export default ToastDemoInner