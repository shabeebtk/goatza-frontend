"use client"

import { useEffect, useRef, useState } from "react"
import { useForm, type SubmitHandler, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { Input, Button } from "@/shared/components/ui"
import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import type { MapboxCity } from "@/shared/services/mapbox.service"

import { 
  useUpdateOrganization, 
  useUpsertOrgLocation, 
  useDeleteOrgLocation 
} from "../../hooks/useOrganizations"
import { useCheckUsername } from "@/features/profile/hooks/useProfileQueries"
import { OrganizationDetail, OrgLocation, OrgLocationPayload } from "../../types"

import styles from "./EditOrgProfileModal.module.css"

// ── Zod schema ────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(50, "Max 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and _"),
  type: z.enum(["club", "team", "academy", "school", ""]),
  headline: z.string().max(150).optional(),
  description: z.string().max(2000).optional(),
  website: z.union([z.string().url("Must be a valid URL"), z.string().length(0)]).optional(),
  level: z.enum(["youth", "amateur", "semi_professional", "professional", ""]).optional(),
})

type FormValues = z.infer<typeof schema>

// ── Username status ───────────────────────────────────────────

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid"

function UsernameStatusIndicator({ status }: { status: UsernameStatus }) {
  if (status === "idle") return null
  if (status === "checking") return (
    <span className={`${styles.usernameStatus} ${styles.statusChecking}`}>
      <span className={styles.miniSpinner} /> Checking…
    </span>
  )
  if (status === "available") return (
    <span className={`${styles.usernameStatus} ${styles.statusAvailable}`}>
      <Icon icon="mdi:check-circle-outline" width={13} height={13} />
      Available
    </span>
  )
  return (
    <span className={`${styles.usernameStatus} ${styles.statusTaken}`}>
      <Icon icon="mdi:close-circle-outline" width={13} height={13} />
      {status === "taken" ? "Already taken" : "Not allowed"}
    </span>
  )
}

// ── Section header ────────────────────────────────────────────

function SectionHeader({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionTitleGroup}>
        <Icon icon={icon} width={16} height={16} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{title}</h3>
      </div>
      {action}
    </div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────

function Field({
  label, required, error, hint, children,
}: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ""}`}>
      <label className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.fieldRequired} aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <p className={styles.fieldErrorMsg} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
          {error}
        </p>
      )}
      {hint && !error && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

interface EditOrgProfileModalProps {
  org: OrganizationDetail
  onClose: () => void
}

export default function EditOrgProfileModal({ org, onClose }: EditOrgProfileModalProps) {
  const updateOrgData = useUpdateOrganization(org.id)
  const upsertLocation = useUpsertOrgLocation(org.id)
  const deleteLocation = useDeleteOrgLocation(org.id)
  const checkUsername = useCheckUsername()

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Location Form state
  const [isLocationFormOpen, setIsLocationFormOpen] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState("")
  const [locationAddress, setLocationAddress] = useState("")
  const [isPrimaryLocation, setIsPrimaryLocation] = useState(false)
  const [selectedCity, setSelectedCity] = useState<MapboxCity | null>(null)

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isDirty, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      name: org.name ?? "",
      username: org.username ?? "",
      type: (org.type as FormValues["type"]) ?? "",
      headline: org.headline ?? "",
      description: org.description ?? "",
      website: org.website ?? "",
      level: (org.level as FormValues["level"]) ?? "",
    },
  })

  const watchedUsername = watch("username")

  // ── Username availability debounce ────────────────────────────
  useEffect(() => {
    const current = watchedUsername?.trim()
    if (!current || current === org.username) { setUsernameStatus("idle"); return }
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(current)) { setUsernameStatus("idle"); return }

    setUsernameStatus("checking")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await checkUsername.mutateAsync(current).catch(() => null)
      if (!result) setUsernameStatus("invalid")
      else if (result.available) setUsernameStatus("available")
      else setUsernameStatus("taken")
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedUsername, org.username])

  // ── Submit Organization Profile ───────────────────────────────
  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      setError("username", { message: "Choose a different username" })
      return
    }

    const payload: Record<string, unknown> = {}

    if (dirtyFields.name) payload.name = values.name
    if (dirtyFields.username) payload.username = values.username
    if (dirtyFields.type) payload.type = values.type || null
    if (dirtyFields.headline) payload.headline = values.headline ?? ""
    if (dirtyFields.description) payload.description = values.description ?? ""
    if (dirtyFields.website) payload.website = values.website ?? ""
    if (dirtyFields.level) payload.level = values.level || null

    if (Object.keys(payload).length === 0) { onClose(); return }

    try {
      await updateOrgData.mutateAsync(payload)
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object"
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined
      if (msg?.toLowerCase().includes("username")) {
        setError("username", { message: msg })
      }
    }
  }

  // ── Location Handlers ─────────────────────────────────────────

  const openLocationForm = (loc?: OrgLocation) => {
    if (loc) {
      setEditingLocationId(loc.id)
      setLocationName(loc.name || "")
      setLocationAddress(loc.address || "")
      setIsPrimaryLocation(loc.is_primary || false)
      if (loc.city && loc.country_code) {
        setSelectedCity({
          label: `${loc.city}, ${loc.country_code}`,
          name: loc.city,
          state: loc.state || "",
          country_code: loc.country_code,
          latitude: loc.latitude ?? 0,
          longitude: loc.longitude ?? 0,
          external_id: "",
        })
      } else {
        setSelectedCity(null)
      }
    } else {
      setEditingLocationId(null)
      setLocationName("")
      setLocationAddress("")
      setIsPrimaryLocation(org.locations?.length === 0) // Default first one to primary
      setSelectedCity(null)
    }
    setIsLocationFormOpen(true)
  }

  const closeLocationForm = () => {
    setIsLocationFormOpen(false)
    setEditingLocationId(null)
    setSelectedCity(null)
  }

  const handleSaveLocation = async () => {
    if (!selectedCity) return

    const payload: OrgLocationPayload = {
      id: editingLocationId,
      name: locationName,
      address: locationAddress,
      city: selectedCity.name,
      state: selectedCity.state,
      country_code: selectedCity.country_code,
      latitude: selectedCity.latitude,
      longitude: selectedCity.longitude,
      is_primary: isPrimaryLocation
    }

    try {
      await upsertLocation.mutateAsync(payload)
      closeLocationForm()
    } catch (err) {
      console.error("Failed to save location", err)
    }
  }

  const handleDeleteLocation = async (id: string) => {
    if (confirm("Are you sure you want to delete this location?")) {
      try {
        await deleteLocation.mutateAsync(id)
      } catch (err) {
        console.error("Failed to delete location", err)
      }
    }
  }

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const headlineLen = watch("headline")?.length ?? 0
  const descriptionLen = watch("description")?.length ?? 0

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Edit organization"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Edit Organization</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Form ── */}
        <div className={styles.form}>
          <div className={styles.body}>

            {/* ── Basic Info ── */}
            <form id="orgProfileForm" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className={styles.section} style={{ marginBottom: 16 }}>
                <SectionHeader icon="mdi:office-building" title="Basic Info" />

                <Field label="Organization Name" required error={errors.name?.message}>
                  <Input {...register("name")} placeholder="Organization Name" required />
                </Field>

                <Field
                  label="Username"
                  required
                  error={errors.username?.message}
                  hint="Letters, numbers and _ only."
                >
                  <div className={styles.inputWithStatus}>
                    <Input
                      {...register("username")}
                      placeholder="username"
                      leftIcon={<span style={{ color: "var(--color-text-muted)" }}>@</span>}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <div className={styles.inputStatusSlot}>
                      <UsernameStatusIndicator status={usernameStatus} />
                    </div>
                  </div>
                </Field>
                
                <Field label="Organization Type" error={errors.type?.message}>
                  <select className={styles.selectField} {...register("type")}>
                    <option value="">Select Type</option>
                    <option value="club">Club</option>
                    <option value="team">Team</option>
                    <option value="academy">Academy</option>
                    <option value="school">School</option>
                  </select>
                </Field>

                <Field label="Headline" error={errors.headline?.message} hint={`${headlineLen}/150`}>
                  <Input {...register("headline")} placeholder="e.g. Passion. Pride. Performance." maxLength={150} />
                </Field>

                <Field label="Description" error={errors.description?.message} hint={`${descriptionLen}/2000`}>
                  <Input
                    as="textarea"
                    {...register("description")}
                    placeholder="Tell the world about this organization…"
                    rows={4}
                    maxLength={2000}
                  />
                </Field>
                
                <div className={styles.row2}>
                  <Field label="Level" error={errors.level?.message}>
                    <select className={styles.selectField} {...register("level")}>
                      <option value="">Select Level</option>
                      <option value="youth">Youth</option>
                      <option value="amateur">Amateur</option>
                      <option value="semi_professional">Semi Professional</option>
                      <option value="professional">Professional</option>
                    </select>
                  </Field>
                  <Field label="Website" error={errors.website?.message}>
                    <Input {...register("website")} type="url" placeholder="https://example.com" />
                  </Field>
                </div>
              </div>
            </form>

            {/* ── Locations ── */}
            <div className={styles.section}>
              <SectionHeader 
                icon="mdi:map-marker-multiple-outline" 
                title="Locations" 
                action={
                  !isLocationFormOpen && (
                    <button type="button" className={styles.addLocationBtn} onClick={() => openLocationForm()}>
                      <Icon icon="mdi:plus" width={14} height={14} /> Add Location
                    </button>
                  )
                }
              />

              {!isLocationFormOpen && (
                <div className={styles.locationList}>
                  {org.locations?.length === 0 && (
                    <p className={styles.fieldHint}>No locations added yet.</p>
                  )}
                  {org.locations?.map(loc => (
                    <div key={loc.id} className={styles.locationItem}>
                      <div className={styles.locationInfo}>
                        <div className={styles.locationName}>
                          {loc.name || loc.city}
                          {loc.is_primary && <span className={styles.primaryBadge}>Primary</span>}
                        </div>
                        <div className={styles.locationAddress}>
                          {[loc.address, loc.city, loc.state, loc.country_code].filter(Boolean).join(", ")}
                        </div>
                      </div>
                      <div className={styles.locationActions}>
                        <button type="button" className={styles.actionIconBtn} onClick={() => openLocationForm(loc)}>
                          <Icon icon="mdi:pencil-outline" width={16} height={16} />
                        </button>
                        <button type="button" className={styles.actionIconBtn} onClick={() => handleDeleteLocation(loc.id)}>
                          <Icon icon="mdi:delete-outline" width={16} height={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLocationFormOpen && (
                <div className={styles.locationForm}>
                  <Field label="Location Name (Optional)">
                    <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Main Training Ground" />
                  </Field>
                  <Field label="City" required hint="Search and select city.">
                    <LocationPicker
                      value={selectedCity}
                      onChange={setSelectedCity}
                      placeholder="Search city…"
                      disabled={upsertLocation.isPending}
                    />
                  </Field>
                  <Field label="Address (Optional)">
                    <Input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Street address" />
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 8 }}>
                    <input 
                      type="checkbox" 
                      checked={isPrimaryLocation} 
                      onChange={e => setIsPrimaryLocation(e.target.checked)} 
                    />
                    Set as primary location
                  </label>
                  <div className={styles.locationFormButtons}>
                    <Button variant="outline" size="sm" onClick={closeLocationForm} disabled={upsertLocation.isPending}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveLocation} disabled={!selectedCity || upsertLocation.isPending}>
                      {upsertLocation.isPending ? "Saving..." : "Save Location"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.comingSoon}>
              <Icon icon="mdi:clock-outline" width={14} height={14} />
              Sports, members &amp; achievements — coming soon
            </div>

          </div>

          {/* ── Footer ── */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="orgProfileForm"
              className={styles.saveBtn}
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting ? (
                <><span className={styles.miniSpinner} aria-hidden="true" /> Saving…</>
              ) : "Save Changes"}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
