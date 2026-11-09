"use client"

import { useState, type ReactNode, type RefObject } from "react"
import { Icon } from "@iconify/react"

import { USERNAME_MIN_LENGTH } from "@/shared/constants/username"
import type { OrgPhotoType } from "../../services/uploadOrgPhoto"
import {
  ABOUT_MAX,
  NAME_MAX,
  ORG_LEVEL_OPTIONS,
  ORG_TYPE_OPTIONS,
  TAGLINE_MAX,
  WEBSITE_MAX,
  type CreateDraft,
  type CreateField,
  type FieldErrors,
} from "./createPageDraft"
import CreateFieldBox, { createInputClass, describedBy, fieldId } from "./CreateField"
import HeaderComposer, { type PickedPhoto } from "./HeaderComposer"
import type { HandleStatus } from "./useHandleCheck"
import styles from "./BasicsStep.module.css"

const HANDLE_STATUS_ID = `${fieldId("username")}-status`
const HANDLE_PREFIX_ID = `${fieldId("username")}-prefix`
const PHOTOS_ERROR_ID = `${fieldId("photos")}-error`
const MORE_PANEL_ID = "org-create-more"
const IDLE_STATUS: HandleStatus = { state: "idle" }

export default function BasicsStep({
  draft,
  errors,
  onName,
  onHandle,
  onChange,
  onBlurField,
  handleStatus,
  onUseSuggestion,
  siteHost,
  logo,
  cover,
  onPhoto,
  headingRef,
  disabled,
}: {
  draft: CreateDraft
  errors: FieldErrors
  onName: (name: string) => void
  onHandle: (raw: string) => void
  onChange: (patch: Partial<CreateDraft>) => void
  onBlurField: (field: CreateField) => void
  handleStatus: HandleStatus
  onUseSuggestion: (handle: string) => void
  /** "goatza.com", from NEXT_PUBLIC_SITE_URL. */
  siteHost: string
  logo: PickedPhoto | null
  cover: PickedPhoto | null
  onPhoto: (type: OrgPhotoType, photo: { blob: Blob; name: string } | null) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  disabled?: boolean
}) {
  const typeOption = ORG_TYPE_OPTIONS.find((option) => option.type === draft.type)

  // "More about your page" starts open when it already holds something (a
  // restored draft), and stays open while one of its fields has an error.
  const [moreWanted, setMoreWanted] = useState(
    () => !!(draft.description.trim() || draft.website.trim())
  )
  const moreOpen = moreWanted || !!(errors.description || errors.website)

  // While the link still follows the name, the first letter or two of a
  // name are not a mistake: "too short" waits until the link is long enough
  // or the person edits it (Continue still says it).
  const quietShortHandle =
    !draft.usernameEdited &&
    handleStatus.state === "invalid" &&
    draft.username.trim().length < USERNAME_MIN_LENGTH
  const shownStatus = quietShortHandle ? IDLE_STATUS : handleStatus

  const handleInvalid =
    !!errors.username || shownStatus.state === "taken" || shownStatus.state === "invalid"

  return (
    <section className={styles.step} aria-labelledby="org-create-basics-heading">
      <h2
        id="org-create-basics-heading"
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
      >
        The basics
      </h2>
      <p className={styles.lead}>How your page looks and where people find it.</p>

      <HeaderComposer
        logo={logo}
        cover={cover}
        onChange={onPhoto}
        typeIcon={typeOption?.icon ?? "mdi:domain"}
        disabled={disabled}
        errorId={errors.photos ? PHOTOS_ERROR_ID : undefined}
      />
      {errors.photos && (
        <p id={PHOTOS_ERROR_ID} className={styles.inlineError}>
          <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
          {errors.photos}
        </p>
      )}

      <div className={styles.fields}>
        <CreateFieldBox field="name" label="Name" required error={errors.name}>
          <input
            id={fieldId("name")}
            className={createInputClass}
            value={draft.name}
            onChange={(event) => onName(event.target.value)}
            onBlur={() => onBlurField("name")}
            maxLength={NAME_MAX}
            autoComplete="organization"
            placeholder={typeOption ? `e.g. Kannur ${typeOption.label}` : "Your page's name"}
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={describedBy("name", { error: !!errors.name })}
            disabled={disabled}
          />
        </CreateFieldBox>

        {/* The status line is this field's error and its live answer at once,
            so it is rendered here rather than as the box's error. */}
        <CreateFieldBox field="username" label="Page link" required>
          <div className={`${styles.handleBox} ${handleInvalid ? styles.handleBoxInvalid : ""}`}>
            <span id={HANDLE_PREFIX_ID} className={styles.handlePrefix}>
              {siteHost}/
            </span>
            <input
              id={fieldId("username")}
              className={styles.handleInput}
              value={draft.username}
              onChange={(event) => onHandle(event.target.value)}
              onBlur={() => onBlurField("username")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              inputMode="text"
              maxLength={40}
              aria-required="true"
              aria-invalid={handleInvalid}
              aria-describedby={`${HANDLE_PREFIX_ID} ${HANDLE_STATUS_ID}`}
              disabled={disabled}
            />
          </div>
          <HandleStatusLine
            status={shownStatus}
            error={errors.username}
            onUseSuggestion={onUseSuggestion}
            disabled={disabled}
          />
        </CreateFieldBox>

        <CreateFieldBox
          field="headline"
          label="Tagline"
          optional
          error={errors.headline}
          count={{ value: draft.headline.length, max: TAGLINE_MAX }}
        >
          <input
            id={fieldId("headline")}
            className={createInputClass}
            value={draft.headline}
            onChange={(event) => onChange({ headline: event.target.value })}
            onBlur={() => onBlurField("headline")}
            maxLength={TAGLINE_MAX}
            placeholder="Elite training for future stars"
            aria-invalid={!!errors.headline}
            aria-describedby={describedBy("headline", { count: true, error: !!errors.headline })}
            disabled={disabled}
          />
        </CreateFieldBox>

        <div className={styles.group}>
          <span id="org-create-level-label" className={styles.groupLabel}>
            Level <span className={styles.optional}>(optional)</span>
          </span>
          <div
            id={fieldId("level")}
            role="group"
            aria-labelledby="org-create-level-label"
            className={styles.chips}
          >
            {ORG_LEVEL_OPTIONS.map((option) => {
              const on = draft.level === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                  onClick={() => onChange({ level: on ? "" : option.value })}
                  disabled={disabled}
                >
                  {on && <Icon icon="mdi:check" width={14} height={14} aria-hidden="true" />}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.more}>
          <button
            type="button"
            className={styles.moreToggle}
            aria-expanded={moreOpen}
            aria-controls={MORE_PANEL_ID}
            onClick={() => setMoreWanted(!moreOpen)}
          >
            <span>More about your page</span>
            <Icon
              icon={moreOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
              width={20}
              height={20}
              aria-hidden="true"
            />
          </button>

          {moreOpen && (
            <div id={MORE_PANEL_ID} className={styles.morePanel}>
              <CreateFieldBox
                field="description"
                label="About"
                optional
                error={errors.description}
                count={{ value: draft.description.length, max: ABOUT_MAX }}
              >
                <textarea
                  id={fieldId("description")}
                  className={createInputClass}
                  value={draft.description}
                  onChange={(event) => onChange({ description: event.target.value })}
                  onBlur={() => onBlurField("description")}
                  maxLength={ABOUT_MAX}
                  rows={4}
                  placeholder="Tell athletes and fans what you're about"
                  aria-invalid={!!errors.description}
                  aria-describedby={describedBy("description", {
                    count: true,
                    error: !!errors.description,
                  })}
                  disabled={disabled}
                />
              </CreateFieldBox>

              <CreateFieldBox
                field="website"
                label="Website"
                optional
                error={errors.website}
                hint="We'll add https:// if you leave it out."
              >
                <input
                  id={fieldId("website")}
                  className={createInputClass}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={draft.website}
                  onChange={(event) => onChange({ website: event.target.value })}
                  onBlur={() => onBlurField("website")}
                  maxLength={WEBSITE_MAX}
                  placeholder="yourclub.com"
                  aria-invalid={!!errors.website}
                  aria-describedby={describedBy("website", {
                    hint: !errors.website,
                    error: !!errors.website,
                  })}
                  disabled={disabled}
                />
              </CreateFieldBox>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function HandleStatusLine({
  status,
  error,
  onUseSuggestion,
  disabled,
}: {
  status: HandleStatus
  error?: string
  onUseSuggestion: (handle: string) => void
  disabled?: boolean
}) {
  let content: ReactNode = null
  let tone: "muted" | "ok" | "bad" = "muted"

  if (error && status.state !== "taken") {
    tone = "bad"
    content = (
      <>
        <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
        {error}
      </>
    )
  } else {
    switch (status.state) {
      case "idle":
        content = "Letters, numbers and underscores, 3–30 characters."
        break
      case "checking":
        content = (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Checking…
          </>
        )
        break
      case "available":
        tone = "ok"
        content = (
          <>
            <Icon icon="mdi:check-circle" width={14} height={14} aria-hidden="true" />
            Available
          </>
        )
        break
      case "taken":
        tone = "bad"
        content = (
          <>
            <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
            <span>
              Taken.
              {status.suggestion && (
                <>
                  {" "}
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => onUseSuggestion(status.suggestion!)}
                    disabled={disabled}
                  >
                    Use @{status.suggestion}
                  </button>
                </>
              )}
            </span>
          </>
        )
        break
      case "invalid":
        tone = "bad"
        content = (
          <>
            <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
            {status.message}
          </>
        )
        break
      case "error":
        content = "Couldn't check this link right now. You can still continue."
        break
    }
  }

  return (
    <p
      id={HANDLE_STATUS_ID}
      className={`${styles.status} ${tone === "ok" ? styles.statusOk : tone === "bad" ? styles.statusBad : ""}`}
      aria-live="polite"
    >
      {content}
    </p>
  )
}
