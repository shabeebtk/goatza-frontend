"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Image from "next/image"
import Link from "next/link"
import imageCompression from "browser-image-compression"
import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useCreateOrganization } from "../../hooks/useOrganizations"
import type { MapboxCity } from "@/shared/services/mapbox.service"
import styles from "./OrganizationSetup.module.css"
import { CreateOrganizationPayload, OrgLevel, OrgType } from "../../types"
import { getUploadSignatureApi, uploadToCloudinaryApi } from "@/features/profile/services/upload.api"

// ── Org type definitions ───────────────────────────────────────

type OrgTypeConfig = {
  type: OrgType
  label: string
  icon: string
  description: string
  examples: string
}

const ORG_TYPES: OrgTypeConfig[] = [
  {
    type: "club",
    label: "Club",
    icon: "mdi:shield-star-outline",
    description: "A sports club with members, teams and regular activities.",
    examples: "Football club, cricket club, sports society",
  },
  {
    type: "team",
    label: "Team",
    icon: "mdi:account-group-outline",
    description: "A competitive team that plays matches in a league or tournament.",
    examples: "District team, college team, franchise",
  },
  {
    type: "academy",
    label: "Academy",
    icon: "mdi:school-outline",
    description: "A structured training program focused on developing athletes.",
    examples: "Football academy, tennis coaching center",
  },
  {
    type: "school",
    label: "School",
    icon: "mdi:domain",
    description: "An educational institution with sports programs.",
    examples: "School, college, university sports department",
  },
]

const ORG_LEVELS: { value: OrgLevel; label: string }[] = [
  { value: "youth", label: "Youth" },
  { value: "amateur", label: "Amateur" },
  { value: "semi_professional", label: "Semi-Professional" },
  { value: "professional", label: "Professional" },
]

// ── Step tracker ──────────────────────────────────────────────

type Step = "type" | "details" | "location" | "sports" | "review"
const STEPS: Step[] = ["type", "details", "location", "sports", "review"]

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current)
  const labels = ["Type", "Details", "Location", "Sports", "Review"]
  return (
    <div className={styles.stepIndicator}>
      {STEPS.map((s, i) => (
        <div key={s} className={styles.stepItem}>
          <div className={`${styles.stepDot} ${i < idx ? styles.stepDone : i === idx ? styles.stepActive : ""}`}>
            {i < idx
              ? <Icon icon="mdi:check" width={12} height={12} />
              : <span>{i + 1}</span>
            }
          </div>
          <span className={`${styles.stepLabel} ${i === idx ? styles.stepLabelActive : ""}`}>
            {labels[i]}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`${styles.stepLine} ${i < idx ? styles.stepLineDone : ""}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Type selector card ────────────────────────────────────────

function TypeCard({
  config,
  selected,
  onSelect,
}: {
  config: OrgTypeConfig
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.typeCard} ${selected ? styles.typeCardSelected : ""}`}
      onClick={onSelect}
    >
      <div className={styles.typeCardIcon}>
        <Icon icon={config.icon} width={28} height={28} />
      </div>
      <div className={styles.typeCardBody}>
        <span className={styles.typeCardLabel}>{config.label}</span>
        <span className={styles.typeCardDesc}>{config.description}</span>
        <span className={styles.typeCardExamples}>{config.examples}</span>
      </div>
      <div className={`${styles.typeCardCheck} ${selected ? styles.typeCardCheckVisible : ""}`}>
        <Icon icon="mdi:check-circle" width={22} height={22} />
      </div>
    </button>
  )
}

// ── Logo uploader ─────────────────────────────────────────────

function LogoUploader({
  value,
  onChange,
  uploading,
  onUpload,
}: {
  value: string | null
  onChange: (url: string) => void
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])


  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    e.target.value = ""
  }

  return (
    <div className={styles.logoUploader}>
      <button
        type="button"
        className={styles.logoBtn}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Upload organization logo"
      >
        {mounted && value ? (
          <img
            src={value}
            alt="Logo"
            width={80}
            height={80}
            className={styles.logoPreview}
          />
        ) : (
          <div className={styles.logoPlaceholder}>
            {uploading
              ? <span className={styles.logoSpinner} />
              : <Icon icon="mdi:camera-plus-outline" width={28} height={28} />
            }
          </div>
        )}
      </button>
      {value && (
        <button
          type="button"
          className={styles.logoRemove}
          onClick={() => onChange("")}
          aria-label="Remove logo"
        >
          <Icon icon="mdi:close" width={14} height={14} />
          Remove
        </button>
      )}
      <p className={styles.logoHint}>PNG or JPG · Max 5 MB · Square recommended</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        className={styles.hiddenInput}
        aria-hidden="true"
      />
    </div>
  )
}

// ── Sport chip ────────────────────────────────────────────────

function SportChip({
  sport,
  selected,
  onToggle,
}: {
  sport: { id: string; name: string; icon_name: string }
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.sportChip} ${selected ? styles.sportChipSelected : ""}`}
      onClick={onToggle}
    >
      <Icon icon={sport.icon_name} width={16} height={16} />
      {sport.name}
      {selected && <Icon icon="mdi:check" width={13} height={13} className={styles.sportChipCheck} />}
    </button>
  )
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
      <label className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.fieldRequired}>*</span>}
      </label>
      {children}
      {error && (
        <p className={styles.fieldErrorMsg}>
          <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
          {error}
        </p>
      )}
      {hint && !error && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  )
}

// ── Review row ────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function OrganizationSetup() {
  const router = useRouter()
  const { data: sports = [] } = useSportsList()
  const { mutate: createOrg, isPending: creating } = useCreateOrganization()

  // ── State ─────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("type")

  // Step 1
  const [orgType, setOrgType] = useState<OrgType | null>(null)

  // Step 2
  const [name, setName] = useState("")
  const [headline, setHeadline] = useState("")
  const [description, setDescription] = useState("")
  const [level, setLevel] = useState<OrgLevel | "">("")
  const [website, setWebsite] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  // Step 3
  const [city, setCity] = useState<MapboxCity | null>(null)
  const [address, setAddress] = useState("")
  const [locName, setLocName] = useState("")

  // Step 4
  const [selectedSports, setSelectedSports] = useState<string[]>([])

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Logo upload ────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setErrors((e) => ({ ...e, logo: "File must be under 5 MB" }))
      return
    }
    setLogoUploading(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: "image/webp",
      })
      const sig = await getUploadSignatureApi("organization_logo")
      const { secure_url } = await uploadToCloudinaryApi(compressed, sig.uploads[0])
      setLogoUrl(secure_url)
      setErrors((e) => { const n = { ...e }; delete n.logo; return n })
    } catch {
      setErrors((e) => ({ ...e, logo: "Upload failed. Please try again." }))
    } finally {
      setLogoUploading(false)
    }
  }, [])

  // ── City auto-fill ─────────────────────────────────────────
  const handleCityChange = (selected: MapboxCity | null) => {
    setCity(selected)
    if (selected && !locName) {
      setLocName("Main Branch")
    }
  }

  // ── Validation per step ────────────────────────────────────
  const validateStep = (): boolean => {
    const errs: Record<string, string> = {}

    if (step === "type" && !orgType) {
      errs.type = "Please select a page type"
    }

    if (step === "details") {
      if (!name.trim()) errs.name = "Name is required"
      else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters"
      if (website && !/^https?:\/\/.+/.test(website)) errs.website = "Must start with http:// or https://"
    }

    if (step === "location" && city) {
      if (!address.trim()) errs.address = "Address is required when location is set"
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Navigation ─────────────────────────────────────────────
  const next = () => {
    if (!validateStep()) return
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }

  const back = () => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!orgType || !name.trim()) return

    const payload: CreateOrganizationPayload = {
      name: name.trim(),
      type: orgType,
      ...(headline && { headline: headline.trim() }),
      ...(description && { description: description.trim() }),
      ...(website && { website: website.trim() }),
      ...(logoUrl && { logo: logoUrl }),
      ...(level && { level: level as OrgLevel }),
      ...(selectedSports.length > 0 && { sport_ids: selectedSports }),
      ...(city && {
        location: {
          name: locName.trim() || "Main Branch",
          address: address.trim(),
          city: city.name,
          state: city.state,
          country_code: city.country_code,
          latitude: city.latitude,
          longitude: city.longitude,
        },
      }),
    }

    createOrg(payload)
  }

  // ── Render steps ───────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bgGrid} aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <Link href="/home" className={styles.headerLogo} aria-label="Go home">
          <Icon icon="mdi:arrow-left" width={18} height={18} />
          <span>Goatza</span>
        </Link>
        <h1 className={styles.headerTitle}>Create a Page</h1>
        <div className={styles.headerSpacer} />
      </header>

      <main className={styles.main}>
        <div className={styles.card}>

          {/* Step indicator */}
          <StepIndicator current={step} />

          {/* ── STEP 1: TYPE ─────────────────────────────── */}
          {step === "type" && (
            <div className={styles.stepContent}>
              <div className={styles.stepHead}>
                <h2 className={styles.stepTitle}>What kind of page?</h2>
                <p className={styles.stepSubtitle}>
                  Choose the type that best describes your organization.
                </p>
              </div>

              <div className={styles.typeGrid}>
                {ORG_TYPES.map((t) => (
                  <TypeCard
                    key={t.type}
                    config={t}
                    selected={orgType === t.type}
                    onSelect={() => {
                      setOrgType(t.type)
                      setErrors({})
                    }}
                  />
                ))}
              </div>

              {errors.type && (
                <p className={styles.globalError}>
                  <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                  {errors.type}
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: DETAILS ──────────────────────────── */}
          {step === "details" && (
            <div className={styles.stepContent}>
              <div className={styles.stepHead}>
                <button type="button" className={styles.backChip} onClick={back}>
                  <Icon icon="mdi:arrow-left" width={14} height={14} />
                  {ORG_TYPES.find((t) => t.type === orgType)?.label}
                </button>
                <h2 className={styles.stepTitle}>Page details</h2>
                <p className={styles.stepSubtitle}>
                  These details help people find and understand your page.
                </p>
              </div>

              {/* Logo */}
              <Field label="Logo" hint="A square logo works best." error={errors.logo}>
                <LogoUploader
                  value={logoUrl}
                  onChange={setLogoUrl}
                  uploading={logoUploading}
                  onUpload={handleLogoUpload}
                />
              </Field>

              <Field label="Name" required error={errors.name}>
                <input
                  className={styles.input}
                  placeholder={`e.g. Kannur ${ORG_TYPES.find((t) => t.type === orgType)?.label}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </Field>

              <Field label="Tagline" hint="A short phrase shown on your page. Max 120 chars.">
                <input
                  className={styles.input}
                  placeholder="Elite training for future stars"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={120}
                />
              </Field>

              <Field label="About" hint="Describe your organization. Up to 600 chars.">
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  placeholder="Tell athletes and fans what you're about…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={600}
                  rows={4}
                />
              </Field>

              <Field label="Level">
                <div className={styles.levelGrid}>
                  {ORG_LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      className={`${styles.levelChip} ${level === l.value ? styles.levelChipSelected : ""}`}
                      onClick={() => setLevel(level === l.value ? "" : l.value)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Website" hint="Optional. Must start with https://" error={errors.website}>
                <input
                  className={styles.input}
                  placeholder="https://yourclub.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  type="url"
                />
              </Field>
            </div>
          )}

          {/* ── STEP 3: LOCATION ─────────────────────────── */}
          {step === "location" && (
            <div className={styles.stepContent}>
              <div className={styles.stepHead}>
                <h2 className={styles.stepTitle}>Where are you based?</h2>
                <p className={styles.stepSubtitle}>
                  Location is optional but helps local athletes discover you.
                </p>
              </div>

              <Field label="City" hint="Search for your city — state and country auto-fill.">
                <LocationPicker
                  value={city}
                  onChange={handleCityChange}
                  placeholder="Search city, e.g. Kannur…"
                />
              </Field>

              {city && (
                <>
                  <div className={styles.autoFilled}>
                    <div className={styles.autoFilledRow}>
                      <Icon icon="mdi:map-marker-check-outline" width={16} height={16} />
                      <span>{city.name}, {city.state}, {city.country_code}</span>
                    </div>
                    <p className={styles.autoFilledHint}>State and country auto-filled from map</p>
                  </div>

                  <Field label="Branch / Location name" hint='e.g. "Main Branch" or "North Campus"'>
                    <input
                      className={styles.input}
                      placeholder="Main Branch"
                      value={locName}
                      onChange={(e) => setLocName(e.target.value)}
                      maxLength={80}
                    />
                  </Field>

                  <Field label="Address" required error={errors.address} hint="Street address or landmark">
                    <input
                      className={styles.input}
                      placeholder="Near Municipal Stadium, Kannur"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      maxLength={200}
                    />
                  </Field>
                </>
              )}

              {!city && (
                <div className={styles.skipHint}>
                  <Icon icon="mdi:information-outline" width={16} height={16} />
                  You can add location later from your org settings.
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: SPORTS ───────────────────────────── */}
          {step === "sports" && (
            <div className={styles.stepContent}>
              <div className={styles.stepHead}>
                <h2 className={styles.stepTitle}>Which sports?</h2>
                <p className={styles.stepSubtitle}>
                  Select all that apply. You can update this later.
                </p>
              </div>

              {sports.length === 0 ? (
                <div className={styles.sportsLoading}>
                  <span className={styles.spinner} />
                </div>
              ) : (
                <div className={styles.sportsGrid}>
                  {sports.map((s) => (
                    <SportChip
                      key={s.id}
                      sport={s}
                      selected={selectedSports.includes(s.id)}
                      onToggle={() =>
                        setSelectedSports((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((id) => id !== s.id)
                            : [...prev, s.id]
                        )
                      }
                    />
                  ))}
                </div>
              )}

              {selectedSports.length > 0 && (
                <p className={styles.selectedCount}>
                  {selectedSports.length} sport{selectedSports.length !== 1 ? "s" : ""} selected
                </p>
              )}

            </div>
          )}

          {/* ── STEP 5: REVIEW ───────────────────────────── */}
          {step === "review" && (
            <div className={styles.stepContent}>
              <div className={styles.stepHead}>
                <h2 className={styles.stepTitle}>Review & create</h2>
                <p className={styles.stepSubtitle}>
                  Double-check everything before creating your page.
                </p>
              </div>

              <div className={styles.reviewCard}>

                {/* Logo + name */}
                <div className={styles.reviewHero}>
                  <div className={styles.reviewLogoWrap}>
                    {logoUrl
                      ? <Image src={logoUrl} alt="" width={64} height={64} className={styles.reviewLogo} />
                      : (
                        <div className={styles.reviewLogoFallback}>
                          <Icon icon={ORG_TYPES.find((t) => t.type === orgType)?.icon ?? "mdi:domain"} width={28} height={28} />
                        </div>
                      )
                    }
                  </div>
                  <div>
                    <p className={styles.reviewName}>{name}</p>
                    <p className={styles.reviewType}>
                      {ORG_TYPES.find((t) => t.type === orgType)?.label}
                      {level && ` · ${ORG_LEVELS.find((l) => l.value === level)?.label}`}
                    </p>
                  </div>
                </div>

                <div className={styles.reviewDivider} />

                <ReviewRow label="Tagline" value={headline} />
                <ReviewRow label="About" value={description} />
                <ReviewRow label="Website" value={website} />
                <ReviewRow
                  label="Location"
                  value={city ? `${locName || "Main Branch"} · ${address}, ${city.name}` : undefined}
                />
                <ReviewRow
                  label="Sports"
                  value={
                    selectedSports.length > 0
                      ? sports.filter((s) => selectedSports.includes(s.id)).map((s) => s.name).join(", ")
                      : undefined
                  }
                />

                {!headline && !description && !city && selectedSports.length === 0 && (
                  <p className={styles.reviewMinimal}>
                    <Icon icon="mdi:information-outline" width={14} height={14} />
                    Only name and type are set. You can add more details later from org settings.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Footer nav ───────────────────────────────── */}
          <div className={styles.footer}>
            {step !== "type" && (
              <button
                type="button"
                className={styles.btnBack}
                onClick={back}
                disabled={creating}
              >
                <Icon icon="mdi:arrow-left" width={16} height={16} />
                Back
              </button>
            )}

            <div className={styles.footerRight}>
              {step !== "review" ? (
                <>
                  {(step === "location" || step === "sports") && (
                    <button
                      type="button"
                      className={styles.btnSkip}
                      onClick={next}
                    >
                      Skip for now
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.btnNext}
                    onClick={next}
                  >
                    Continue
                    <Icon icon="mdi:arrow-right" width={16} height={16} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.btnCreate}
                  onClick={handleSubmit}
                  disabled={creating}
                >
                  {creating ? (
                    <><span className={styles.spinner} /> Creating…</>
                  ) : (
                    <><Icon icon="mdi:check-circle-outline" width={18} height={18} /> Create Page</>
                  )}
                </button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}