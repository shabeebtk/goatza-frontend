"use client"

import { useState } from "react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { initialsOf } from "../../format"
import styles from "./PageAvatar.module.css"

/**
 * The shared Avatar, falling back to initials when its photo fails to load
 * (a deleted object, a dropped connection), never a broken-image icon. The
 * shared one stays as it is: the server-rendered CV and the trial-pass image
 * route draw it, and neither can hold state.
 *
 * React carries an img's `error` to an ancestor's capture handler, so the
 * wrapper hears it without reaching into Avatar.
 */
export default function PageAvatar({
  src,
  name,
  size = "md",
  className,
}: {
  src: string | null | undefined
  name: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const photo = src && src !== failed ? src : undefined

  return (
    <span className={styles.wrap} onErrorCapture={() => setFailed(src ?? null)}>
      <Avatar src={photo} initials={initialsOf(name)} size={size} className={className} />
    </span>
  )
}
