"use client"

import { useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import Input from "@/shared/components/ui/Input/Input"
import styles from "./SearchInput.module.css"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  /** Fired on Enter — bypasses the page's debounce and saves to recents. */
  onSubmit: () => void
  onClear: () => void
  /** True while any section is fetching → shows a spinner in place of the ×. */
  isFetching?: boolean
}

/**
 * The /search header input. Auto-focuses on mount, submits immediately on Enter,
 * and shows a spinner (fetching) or a clear × (idle) as its trailing adornment.
 */
export default function SearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  isFetching = false,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  // Focus on mount so the keyboard opens straight away when the page is entered.
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const showClear = value.length > 0 && !isFetching
  const rightIcon = isFetching ? (
    <Icon icon="mdi:loading" width={18} height={18} className={styles.spin} />
  ) : showClear ? (
    <Icon icon="mdi:close" width={18} height={18} />
  ) : undefined

  return (
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onSubmit()
        }
      }}
      placeholder="Search players, teams, academies, posts…"
      aria-label="Search"
      leftIcon={<Icon icon="mdi:magnify" width={18} height={18} />}
      rightIcon={rightIcon}
      onRightIconClick={showClear ? onClear : undefined}
    />
  )
}
