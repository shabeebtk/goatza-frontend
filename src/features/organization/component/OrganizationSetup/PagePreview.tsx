"use client"

import { Icon } from "@iconify/react"
import type { Sport } from "@/features/profile/services/sports.api"
import {
  ORG_TYPE_OPTIONS,
  levelLabel,
  typeLabel,
  type CreateDraft,
} from "./createPageDraft"
import styles from "./PagePreview.module.css"

/**
 * What the page's header will look like, from the draft as it stands: cover,
 * logo, name, @handle, type · level, tagline, location and sports. Read-only;
 * Review puts its Edit links around it.
 */
export default function PagePreview({
  draft,
  logoUrl,
  coverUrl,
  sports,
  compact = false,
}: {
  draft: CreateDraft
  logoUrl?: string | null
  coverUrl?: string | null
  sports: Sport[]
  /** The desktop side column: no about text. */
  compact?: boolean
}) {
  const icon = ORG_TYPE_OPTIONS.find((option) => option.type === draft.type)?.icon ?? "mdi:domain"
  const name = draft.name.trim()
  const handle = draft.username.trim()
  const meta = [typeLabel(draft.type), levelLabel(draft.level)].filter(Boolean).join(" · ")
  const picked = draft.sportIds
    .map((id) => sports.find((sport) => sport.id === id))
    .filter((sport): sport is Sport => !!sport)
  const place = draft.city
    ? [draft.branchName.trim(), [draft.city.name, draft.city.state].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ")
    : ""

  return (
    <div className={styles.card}>
      <div className={styles.cover}>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: preview of an unsaved crop; next/image can't load one
          <img src={coverUrl} alt="" className={styles.coverImg} />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.logo}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: preview of an unsaved crop; next/image can't load one
            <img src={logoUrl} alt="" className={styles.logoImg} />
          ) : (
            <Icon icon={icon} width={28} height={28} aria-hidden="true" />
          )}
        </div>

        <p className={`${styles.name} ${name ? "" : styles.placeholder}`}>
          {name || "Your page's name"}
        </p>
        <p className={styles.handle}>{handle ? `@${handle}` : "@yourpage"}</p>
        {meta && <p className={styles.meta}>{meta}</p>}
        {draft.headline.trim() && <p className={styles.tagline}>{draft.headline.trim()}</p>}
        {!compact && draft.description.trim() && (
          <p className={styles.about}>{draft.description.trim()}</p>
        )}

        {place && (
          <p className={styles.place}>
            <Icon icon="mdi:map-marker-outline" width={14} height={14} aria-hidden="true" />
            {place}
          </p>
        )}

        {picked.length > 0 && (
          <ul className={styles.sports} aria-label="Sports">
            {picked.map((sport, index) => (
              <li key={sport.id} className={`${styles.sport} ${index === 0 ? styles.sportPrimary : ""}`}>
                <Icon icon={sport.icon_name} width={13} height={13} aria-hidden="true" />
                {sport.name}
                {index === 0 && picked.length > 1 && (
                  <span className={styles.srOnly}> (primary)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
