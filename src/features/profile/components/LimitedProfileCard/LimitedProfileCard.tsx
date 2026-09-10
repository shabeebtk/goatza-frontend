"use client"

/**
 * The stripped card a logged-out visitor gets for a MINOR's profile.
 *
 * The model is a private Instagram account in a search result: enough that the
 * page is worth having indexed and worth landing on, and nothing that
 * describes the child. What renders here is the entirety of what the server
 * sent — the photos arrive as "", the measurements as null, the about as "" —
 * so this component is not hiding anything a determined reader could recover
 * from the payload. There is nothing in it to recover.
 *
 * NO GREY SILHOUETTE WHERE THE PHOTO WOULD BE.
 *
 * That is the one visual decision worth defending. The default empty-avatar
 * treatment — a grey person-shaped icon — reads as "this image failed to
 * load", and a page that looks broken gets closed, bounced from and treated by
 * search as low quality. Every one of those outcomes lands on the young player
 * whose profile it is. Initials on a solid brand block read as a designed
 * choice instead, which is what they are, and on a sports platform a monogram
 * is already the visual language of a squad number or a club crest. The sport
 * icon does the same job when there is a sport to show.
 *
 * The counts stay because they are already public on every card in the app and
 * carry no detail about the person. The city stays at DISTRICT resolution —
 * the server coarsened it before it got here.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import type { PublicUserProfile } from "@/features/profile/services/publicProfile.api"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import styles from "./LimitedProfileCard.module.css"

/** Up to two initials, first and last word. Mirrors the share card's monogram. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"

  const first = words[0][0] ?? ""
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : ""

  return `${first}${last}`.toUpperCase()
}

/** "Joined March 2024" — created_at is in the payload and is not sensitive. */
function joinedLabel(createdAt: string): string | null {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null

  return `Joined ${date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })}`
}

export default function LimitedProfileCard({
  profile,
  nextPath,
}: {
  profile: PublicUserProfile
  /** Where to return after signing in — this profile. */
  nextPath: string
}) {
  const displayName = profile.name || profile.username
  const sport = profile.primary_sport
  const joined = joinedLabel(profile.created_at)

  return (
    <div className={styles.wrap}>
      <article className={styles.card}>
        {/* The monogram. `aria-hidden` because the name it abbreviates is
            announced immediately below — a screen reader saying "AN" first is
            noise, not information. */}
        <span className={styles.monogram} aria-hidden="true">
          {sport?.icon_name ? (
            <Icon icon={sport.icon_name} width={34} height={34} />
          ) : (
            initials(displayName)
          )}
        </span>

        <h1 className={styles.name}>{displayName}</h1>
        <p className={styles.handle}>@{profile.username}</p>

        {profile.headline && (
          <p className={styles.headline}>{profile.headline}</p>
        )}

        {(sport || profile.location) && (
          <div className={styles.facts}>
            {sport && (
              <span className={styles.fact}>
                <Icon icon="mdi:trophy-outline" width={15} height={15} aria-hidden="true" />
                {sport.primary_position
                  ? `${sport.sport} · ${sport.primary_position}`
                  : sport.sport}
              </span>
            )}

            {profile.location && (
              <span className={styles.fact}>
                <Icon icon="mdi:map-marker-outline" width={15} height={15} aria-hidden="true" />
                {profile.location.city}
              </span>
            )}
          </div>
        )}

        <dl className={styles.counts}>
          <div className={styles.count}>
            <dt className={styles.countLabel}>Followers</dt>
            <dd className={styles.countValue}>{profile.followers_count}</dd>
          </div>
          <div className={styles.count}>
            <dt className={styles.countLabel}>Following</dt>
            <dd className={styles.countValue}>{profile.following_count}</dd>
          </div>
        </dl>

        {joined && <p className={styles.joined}>{joined}</p>}
      </article>

      {/*
        The call to action. Says what signing in gets them and nothing about
        WHY the profile is limited — "this player is a minor" would restore, in
        one sentence of copy, the age signal the server just spent a serializer
        removing.
      */}
      <div className={styles.gate}>
        <span className={styles.gateMark} aria-hidden="true">
          <Icon icon="mdi:lock-outline" width={22} height={22} />
        </span>

        <p className={styles.gateTitle}>Sign in to see the full profile</p>
        <p className={styles.gateMessage}>
          Photos, stats, highlights and posts are only visible to people on
          Goatza.
        </p>

        <div className={styles.gateActions}>
          <Link
            href={authUrlWithNext(nextPath, "signup")}
            className={styles.primaryBtn}
          >
            Join Goatza
          </Link>
          <Link
            href={authUrlWithNext(nextPath, "login")}
            className={styles.secondaryBtn}
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}
