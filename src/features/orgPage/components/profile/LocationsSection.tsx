"use client"

import { useId, useState } from "react"
import { Icon } from "@iconify/react"

import { directionsUrl, type ProfileLocation } from "../../profileSections"
import ProfileSection, { ShowAllButton } from "./ProfileSection"
import styles from "./LocationsSection.module.css"

/**
 * The profile's Locations block, moved here: the first branch, "Show N more"
 * for the rest, and Directions beside each one.
 */
export default function LocationsSection({
  locations,
  divider = true,
}: {
  locations: ProfileLocation[]
  /** Off in the desktop aside, where it is a card of its own. */
  divider?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  if (locations.length === 0) return null
  const shown = expanded ? locations : locations.slice(0, 1)

  return (
    <ProfileSection
      sectionKey="locations"
      title={locations.length > 1 ? "Locations" : "Location"}
      divider={divider}
    >
      <ul id={listId} className={styles.list}>
        {shown.map((location) => {
          const cityLine = [location.city, location.state, location.country_code].filter(Boolean).join(", ")
          const directions = directionsUrl(location)
          const label = location.name || location.address || location.city || "this branch"
          return (
            <li key={location.id} className={styles.item}>
              <span className={styles.icon} aria-hidden="true">
                <Icon
                  icon={location.is_primary ? "mdi:map-marker" : "mdi:map-marker-outline"}
                  width={18}
                  height={18}
                />
              </span>
              <div className={styles.text}>
                {location.name && <span className={styles.name}>{location.name}</span>}
                {location.address && <span className={styles.address}>{location.address}</span>}
                {cityLine && <span className={styles.meta}>{cityLine}</span>}
                {!location.name && !location.address && !cityLine && (
                  <span className={styles.address}>Location on file</span>
                )}
              </div>
              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.directions}
                  aria-label={`Directions to ${label}`}
                >
                  <Icon icon="mdi:directions" width={18} height={18} aria-hidden="true" />
                  Directions
                </a>
              )}
            </li>
          )
        })}
      </ul>

      {locations.length > 1 && (
        <ShowAllButton
          expanded={expanded}
          total={locations.length}
          noun="locations"
          controls={listId}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </ProfileSection>
  )
}
