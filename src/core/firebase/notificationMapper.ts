import { ToastContextValue } from "@/shared/components/ui/Toast/Toast"

export const handleNotificationToast = (
  data: any,
  toast: ToastContextValue
) => {
  const type = data.type

  switch (type) {
    case "follow":
      toast.show({
        title: `${data.actor_name} started following you`,
        avatarSrc: data.actor_avatar,
        avatarInitials: data.actor_initials,
        position: "top-right",
        duration: 4000,
        action: {
          label: "View Profile",
          onClick: () => {
            window.location.href = `/profile/${data.actor_username}`
          },
        },
      })
      break

    case "like":
      toast.show({
        title: `${data.actor_name} liked your post`,
        message: data.preview_text || "",
        avatarSrc: data.actor_avatar,
        position: "top-right",
        duration: 4000,
        action: {
          label: "View Post",
          onClick: () => {
            window.location.href = `/post/${data.target_id}`
          },
        },
      })
      break

    case "comment":
      toast.show({
        title: `${data.actor_name} commented on your post`,
        message: data.preview_text,
        icon: "mdi:comment",
        variant: "info",
        position: "top-right",
        duration: 5000,
        action: {
          label: "Reply",
          onClick: () => {
            window.location.href = `/post/${data.target_id}`
          },
        },
      })
      break

    default:
      toast.show({
        title: data.title || "New notification",
        message: data.body,
        position: "top-right",
      })
  }
}