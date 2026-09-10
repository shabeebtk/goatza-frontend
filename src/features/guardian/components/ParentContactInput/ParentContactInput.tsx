"use client"

import { Icon } from "@iconify/react"

import { Input } from "@/shared/components/ui"

import { ENABLED_CONTACT_CHANNELS, type GuardianContactChannel } from "../../types"
import styles from "./ParentContactInput.module.css"

/**
 * ONE way to reach the parent — and the seam where the second one turns on.
 *
 * Today `ENABLED_CONTACT_CHANNELS` holds only "email", so this renders a single
 * email field and no chooser: a switcher with one option is a control that
 * cannot be operated, and it would sit there asking to be tapped for the whole
 * life of this build. Add "phone" to that array and the chooser appears, the
 * field changes its label, keyboard, autocomplete and icon, and the payload
 * starts carrying the other key. Nothing else moves.
 *
 * The reason it is built this way rather than as a bare <Input> that gets
 * replaced later: the CHANNEL is part of the answer, not a detail of the
 * widget. The form already tracks which one was used and already sends it, so
 * enabling phone does not change the shape of anything the server receives — it
 * only widens the set of values one field can take.
 */

type ChannelMeta = {
  label: string
  placeholder: string
  /** The tab a phone keyboard opens on. Wrong one costs a real tap per field. */
  type: "email" | "tel"
  autoComplete: string
  icon: string
  /** Name of the chooser button, when there is a chooser. */
  short: string
}

export const CHANNEL_META: Record<GuardianContactChannel, ChannelMeta> = {
  email: {
    label: "Parent or guardian's email",
    placeholder: "parent@example.com",
    type: "email",
    autoComplete: "email",
    icon: "mdi:email-outline",
    short: "Email",
  },
  phone: {
    label: "Parent or guardian's phone",
    placeholder: "Their mobile number",
    type: "tel",
    autoComplete: "tel",
    icon: "mdi:phone-outline",
    short: "Phone",
  },
}

interface ParentContactInputProps {
  channel: GuardianContactChannel
  onChannelChange: (channel: GuardianContactChannel) => void
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
}

export default function ParentContactInput({
  channel,
  onChannelChange,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: ParentContactInputProps) {
  const meta = CHANNEL_META[channel]
  const showChooser = ENABLED_CONTACT_CHANNELS.length > 1

  return (
    <div className={styles.field}>
      {showChooser && (
        <div className={styles.chooser} role="group" aria-label="How to reach them">
          {ENABLED_CONTACT_CHANNELS.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={option === channel}
              className={`${styles.chooserBtn} ${
                option === channel ? styles.chooserBtnActive : ""
              }`}
              onClick={() => onChannelChange(option)}
            >
              {CHANNEL_META[option].short}
            </button>
          ))}
        </div>
      )}

      <Input
        label={meta.label}
        type={meta.type}
        inputMode={channel === "phone" ? "tel" : "email"}
        placeholder={meta.placeholder}
        autoComplete={meta.autoComplete}
        leftIcon={<Icon icon={meta.icon} width={18} height={18} />}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        error={error}
      />
    </div>
  )
}
