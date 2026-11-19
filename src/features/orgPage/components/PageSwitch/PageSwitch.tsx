"use client"

import styles from "./PageSwitch.module.css"

/**
 * An on/off switch, on its own: the hub's section rows and the contact cards put
 * their own words beside it. Copied from squads' SquadSwitch rather than shared.
 *
 * A real `<button role="switch">`: Space and Enter toggle it because a button
 * already answers both with a click, so there is no key handler to double it.
 * The track is 50×30; the button around it is 44px tall, so it is easy to hit.
 */
export default function PageSwitch({
  checked,
  onChange,
  label,
  describedBy,
  disabled,
  busy,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Names the switch for a screen reader ("Coaches", "WhatsApp"). */
  label: string
  /** The id of the line that explains it, when there is one. */
  describedBy?: string
  disabled?: boolean
  /** A write is in flight: dimmed, still the state it shows. */
  busy?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      disabled={disabled}
      className={`${styles.switch} ${checked ? styles.on : ""} ${busy ? styles.busy : ""} ${
        className ?? ""
      }`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  )
}
