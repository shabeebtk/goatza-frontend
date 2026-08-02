"use client"

/**
 * OrganizationCombobox
 *
 * Type to search Goatza organizations; pick one to tag the entry to a real org,
 * or take the always-last `Use "<typed text>"` option to keep it as free text.
 *
 * Those two outcomes are the whole point of the control, and they are not
 * cosmetic: an entry tagged to a real org enters that org's verification queue
 * and can come back with a check mark, while free text can only ever be
 * self-reported. `value.id` is what distinguishes them.
 *
 * Search reuses the existing explore/search endpoint (`useSearchOrgs`) — no new
 * API. Structure follows LocationPicker: debounce lives in the query hook's
 * `enabled` gate, outside-click closes, the input mirrors the current value.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import { useSearchOrgs } from "@/features/search/hooks/useSearchQueries"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { organizationInitials } from "../../careerMeta"
import styles from "./OrganizationCombobox.module.css"

/** `id: null` means the name is free text the user typed themselves. */
export type SelectedOrganization = {
    id: string | null
    name: string
    logo?: string
    username?: string
}

interface OrganizationComboboxProps {
    value: SelectedOrganization | null
    onChange: (value: SelectedOrganization | null) => void
    disabled?: boolean
    error?: string
}

/** Matches the search hook's own gate — below this nothing hits the network. */
const MIN_QUERY = 2

export default function OrganizationCombobox({
    value,
    onChange,
    disabled = false,
    error,
}: OrganizationComboboxProps) {
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Empty `types` = every organization kind. `toQuery` in the explore api
    // drops empty strings, so nothing is sent and the server doesn't filter.
    const trimmed = query.trim()
    const { data, isFetching } = useSearchOrgs(trimmed, "")

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    const results = useMemo(() => data?.results ?? [], [data])

    // Don't offer `Use "Dream FC"` when an org named exactly that is already in
    // the list — it reads as a trap, and the tagged one is always the better pick.
    const exactMatch = results.some(
        (org) => org.name.toLowerCase() === trimmed.toLowerCase()
    )
    const showFreeTextOption = trimmed.length > 0 && !exactMatch

    const handleSelectOrg = (org: (typeof results)[number]) => {
        onChange({
            id: org.id,
            name: org.name,
            logo: org.logo,
            username: org.username,
        })
        setQuery("")
        setOpen(false)
    }

    const handleUseFreeText = () => {
        onChange({ id: null, name: trimmed })
        setQuery("")
        setOpen(false)
    }

    const handleClear = () => {
        onChange(null)
        setQuery("")
        setOpen(false)
    }

    // ── Chosen state ──────────────────────────────────────────
    if (value) {
        return (
            <div className={styles.wrap} ref={containerRef}>
                <div
                    className={`${styles.selected} ${error ? styles.selectedError : ""}`}
                >
                    <Avatar
                        src={value.logo || undefined}
                        initials={organizationInitials(value.name)}
                        alt={value.name}
                        size="sm"
                        className={styles.selectedAvatar}
                    />
                    <div className={styles.selectedText}>
                        <span className={styles.selectedName}>{value.name}</span>
                        <span className={styles.selectedMeta}>
                            {value.id ? (
                                <>
                                    <Icon
                                        icon="mdi:link-variant"
                                        width={11}
                                        height={11}
                                    />
                                    {value.username ? `@${value.username}` : "On Goatza"}
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:pencil-outline" width={11} height={11} />
                                    Typed manually
                                </>
                            )}
                        </span>
                    </div>
                    <button
                        className={styles.clearBtn}
                        onClick={handleClear}
                        type="button"
                        aria-label="Change club"
                        disabled={disabled}
                    >
                        <Icon icon="mdi:close" width={16} height={16} />
                    </button>
                </div>
            </div>
        )
    }

    // ── Search state ──────────────────────────────────────────
    return (
        <div className={styles.wrap} ref={containerRef}>
            <div className={`${styles.inputWrap} ${error ? styles.inputError : ""}`}>
                <Icon
                    icon="mdi:magnify"
                    width={17}
                    height={17}
                    className={styles.inputIcon}
                    aria-hidden="true"
                />
                <input
                    className={styles.input}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setOpen(true)
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Search clubs, academies, schools…"
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="career-org-listbox"
                />
                {isFetching && (
                    <span className={styles.miniSpinner} aria-hidden="true" />
                )}
            </div>

            {open && trimmed.length > 0 && (
                <ul className={styles.dropdown} id="career-org-listbox" role="listbox">
                    {trimmed.length < MIN_QUERY && (
                        <li className={styles.hintRow}>Keep typing to search…</li>
                    )}

                    {trimmed.length >= MIN_QUERY &&
                        results.map((org) => (
                            <li key={org.id}>
                                <button
                                    className={styles.optionRow}
                                    onClick={() => handleSelectOrg(org)}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                >
                                    <Avatar
                                        src={org.logo || undefined}
                                        initials={organizationInitials(org.name)}
                                        alt=""
                                        size="sm"
                                        className={styles.optionAvatar}
                                    />
                                    <span className={styles.optionText}>
                                        <span className={styles.optionName}>
                                            {org.name}
                                            {org.is_verified && (
                                                <Icon
                                                    icon="mdi:check-decagram"
                                                    width={12}
                                                    height={12}
                                                    className={styles.optionTick}
                                                />
                                            )}
                                        </span>
                                        <span className={styles.optionUsername}>
                                            @{org.username}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}

                    {trimmed.length >= MIN_QUERY &&
                        !isFetching &&
                        results.length === 0 && (
                            <li className={styles.hintRow}>No clubs matched.</li>
                        )}

                    {/* Always last, so the list never dead-ends on "no match". */}
                    {showFreeTextOption && (
                        <li>
                            <button
                                className={`${styles.optionRow} ${styles.freeTextRow}`}
                                onClick={handleUseFreeText}
                                type="button"
                                role="option"
                                aria-selected={false}
                            >
                                <span className={styles.freeTextIcon} aria-hidden="true">
                                    <Icon icon="mdi:pencil-plus-outline" width={16} height={16} />
                                </span>
                                <span className={styles.optionText}>
                                    <span className={styles.optionName}>
                                        Use &ldquo;{trimmed}&rdquo;
                                    </span>
                                    <span className={styles.optionUsername}>
                                        Not on Goatza — can&apos;t be verified
                                    </span>
                                </span>
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}
