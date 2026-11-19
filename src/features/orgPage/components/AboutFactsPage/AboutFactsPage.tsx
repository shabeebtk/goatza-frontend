"use client"

import { useEffect, useId, useState } from "react"
import { Icon } from "@iconify/react"

import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import { ORG_DESCRIPTION_MAX } from "@/features/organization/orgLimits"
import Button from "@/shared/components/ui/Button/Button"
import Select from "@/shared/components/ui/Select/Select"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { orgNoun } from "../../format"
import { useUpdateAbout, useUpdateFacts } from "../../hooks/useOrgPage"
import { pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import {
  WEEK_DAYS,
  type PageFacts,
  type PageFactsPayload,
  type StudentRange,
  type WeekDay,
} from "../../types"
import PageAdminGate from "../PageAdminGate/PageAdminGate"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import { FieldError, PageTextArea, PageTextField } from "../PageFields/PageFields"
import fieldStyles from "../PageFields/PageFields.module.css"
import DayPicker from "../DayPicker/DayPicker"
import LanguageField from "./LanguageField"
import styles from "./AboutFactsPage.module.css"

const TITLE = "About & key facts"
const FORM_ID = "page-about-form"

// The server's ranges (apps/orgpages/constants.py).
const FOUNDED_MIN = 1850
const AGE_MIN = 3
const AGE_MAX = 80

const STUDENT_OPTIONS: { value: StudentRange; label: string }[] = [
  { value: "under_50", label: "Under 50" },
  { value: "50_100", label: "50–100" },
  { value: "100_200", label: "100–200" },
  { value: "200_500", label: "200–500" },
  { value: "500_plus", label: "500+" },
  { value: "", label: "Not shown" },
]

type SocialField = "instagram_url" | "youtube_url" | "facebook_url"

const SOCIAL: { field: SocialField; site: string; icon: string; hosts: string[]; placeholder: string }[] = [
  {
    field: "instagram_url",
    site: "Instagram",
    icon: "mdi:instagram",
    hosts: ["instagram.com"],
    placeholder: "https://instagram.com/yourpage",
  },
  {
    field: "youtube_url",
    site: "YouTube",
    icon: "mdi:youtube",
    hosts: ["youtube.com", "youtu.be"],
    placeholder: "https://youtube.com/@yourpage",
  },
  {
    field: "facebook_url",
    site: "Facebook",
    icon: "mdi:facebook",
    hosts: ["facebook.com", "fb.com"],
    placeholder: "https://facebook.com/yourpage",
  },
]

/** Where a field's error shows, top to bottom: the first one is scrolled to. */
const FIELD_ORDER = [
  "description",
  "founded_year",
  "age_min",
  "age_max",
  "coaching_languages",
  "training_days",
  "student_range",
  "instagram_url",
  "youtube_url",
  "facebook_url",
]

// ── The form ──────────────────────────────────────────────────

type AboutForm = {
  description: string
  founded: string
  ageFrom: string
  ageTo: string
  languages: string[]
  days: WeekDay[]
  students: StudentRange
} & Record<SocialField, string>

const numberText = (value: number | null) => (value === null || value === undefined ? "" : String(value))

function toForm(description: string, facts: PageFacts): AboutForm {
  return {
    description,
    founded: numberText(facts.founded_year),
    ageFrom: numberText(facts.age_min),
    ageTo: numberText(facts.age_max),
    languages: [...facts.coaching_languages],
    days: WEEK_DAYS.filter((day) => facts.training_days.includes(day)),
    students: facts.student_range,
    instagram_url: facts.instagram_url,
    youtube_url: facts.youtube_url,
    facebook_url: facts.facebook_url,
  }
}

const toNumber = (text: string): number | null => (text.trim() ? Number(text.trim()) : null)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index])

/** The facts that changed, in the server's names. */
function factsChanges(form: AboutForm, saved: AboutForm): PageFactsPayload {
  const out: PageFactsPayload = {}
  if (form.founded.trim() !== saved.founded.trim()) out.founded_year = toNumber(form.founded)
  if (form.ageFrom.trim() !== saved.ageFrom.trim()) out.age_min = toNumber(form.ageFrom)
  if (form.ageTo.trim() !== saved.ageTo.trim()) out.age_max = toNumber(form.ageTo)
  if (!sameList(form.languages, saved.languages)) out.coaching_languages = form.languages
  if (!sameList(form.days, saved.days)) out.training_days = form.days
  if (form.students !== saved.students) out.student_range = form.students
  for (const { field } of SOCIAL) {
    if (form[field].trim() !== saved[field].trim()) out[field] = form[field].trim()
  }
  return out
}

/** A social link the server would take: https, on the site's own host, nothing odd. */
function socialLinkError(value: string, hosts: string[], site: string): string | undefined {
  const text = value.trim()
  if (!text) return undefined
  const message = `Enter an https link to your ${site} page.`
  if (text.length > 300) return message
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return message
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return message
  const host = url.hostname.toLowerCase()
  return hosts.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? undefined : message
}

/** The server's rules, checked first so most mistakes never leave the phone. */
function validate(form: AboutForm): Record<string, string> {
  const errors: Record<string, string> = {}
  const thisYear = new Date().getFullYear()

  const founded = toNumber(form.founded)
  if (founded !== null && (!Number.isInteger(founded) || founded < FOUNDED_MIN || founded > thisYear)) {
    errors.founded_year = `Enter a year between ${FOUNDED_MIN} and ${thisYear}.`
  }

  const from = toNumber(form.ageFrom)
  const to = toNumber(form.ageTo)
  const ageWrong = (age: number | null) =>
    age !== null && (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX)
  if (ageWrong(from)) errors.age_min = `Ages go from ${AGE_MIN} to ${AGE_MAX}.`
  if (ageWrong(to)) errors.age_max = `Ages go from ${AGE_MIN} to ${AGE_MAX}.`
  if (!errors.age_min && !errors.age_max && from !== null && to !== null && from > to) {
    errors.age_max = "The oldest age can't be below the youngest."
  }

  for (const { field, hosts, site } of SOCIAL) {
    const error = socialLinkError(form[field], hosts, site)
    if (error) errors[field] = error
  }
  return errors
}

/** "instagram.com/x" or "http://…" becomes "https://…", the commonest slip. */
function withHttps(value: string): string {
  const text = value.trim()
  if (!text) return text
  if (/^http:\/\//i.test(text)) return text.replace(/^http:\/\//i, "https://")
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return `https://${text}`
  return text
}

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max)

// ── The page ──────────────────────────────────────────────────

export default function AboutFactsPage({ orgId }: { orgId: string }) {
  return (
    <PageAdminGate orgId={orgId} title={TITLE} skeletonBlocks={[248, 560]}>
      {(admin) => <AboutLoader orgId={orgId} facts={admin.settings.facts} />}
    </PageAdminGate>
  )
}

/** The About text is the org's description, which lives on the profile. */
function AboutLoader({ orgId, facts }: { orgId: string; facts: PageFacts }) {
  const { data: org, isLoading, refetch, isRefetching } = useOrgDetail(orgId)

  if (isLoading) {
    return (
      <PageEditorLayout orgId={orgId} title={TITLE}>
        <div className={styles.skeleton} aria-hidden="true">
          <span className={styles.skeletonBlock} style={{ height: 248 }} />
          <span className={styles.skeletonBlock} style={{ height: 560 }} />
        </div>
      </PageEditorLayout>
    )
  }

  if (!org) {
    return (
      <PageEditorLayout orgId={orgId} title={TITLE}>
        <div className={styles.state} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
          <p>Couldn&apos;t load your page.</p>
          <Button variant="outline" loading={isRefetching} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </PageEditorLayout>
    )
  }

  return (
    <AboutFactsEditor
      orgId={orgId}
      noun={orgNoun(org.type)}
      description={org.description ?? ""}
      facts={facts}
    />
  )
}

function AboutFactsEditor({
  orgId,
  noun,
  description,
  facts,
}: {
  orgId: string
  noun: string
  description: string
  facts: PageFacts
}) {
  const toast = useToast()
  const updateAbout = useUpdateAbout(orgId)
  const updateFacts = useUpdateFacts(orgId)
  const ids = useId()
  const fieldId = (field: string) => `${ids}-${field}`

  // What was last saved, and the form over it. A background refetch never
  // replaces what is being typed.
  const [saved, setSaved] = useState(() => toForm(description, facts))
  const [form, setForm] = useState(saved)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const descriptionChanged = form.description.trim() !== saved.description.trim()
  const factChanges = factsChanges(form, saved)
  const factsChanged = Object.keys(factChanges).length > 0
  const dirty = descriptionChanged || factsChanged

  // The hub's "Add key facts" lands on #facts. The form exists only once both
  // reads are in, so the browser's own jump to the anchor has already missed it.
  useEffect(() => {
    if (window.location.hash !== "#facts") return
    document.getElementById("facts")?.scrollIntoView({ block: "start" })
  }, [])

  const set = <K extends keyof AboutForm>(key: K, value: AboutForm[K], errorKeys: string[] = []) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errorKeys.length) {
      setErrors((current) => {
        if (!errorKeys.some((field) => field in current)) return current
        const next = { ...current }
        for (const field of errorKeys) delete next[field]
        return next
      })
    }
  }

  const showErrors = (fieldErrors: Record<string, string>) => {
    setErrors(fieldErrors)
    const first = FIELD_ORDER.find((field) => fieldErrors[field])
    if (!first) return
    // Days have no one input: the group's first chip takes the focus.
    const element =
      document.getElementById(fieldId(first)) ??
      document.querySelector<HTMLElement>(`[data-field="${first}"] button`)
    element?.scrollIntoView({ block: "center" })
    element?.focus({ preventScroll: true })
  }

  /** A refusal: under its field when the server named one, else a toast. */
  const refused = (err: unknown, fields: string[]) => {
    const named = Object.fromEntries(
      Object.entries(pageFieldErrors(err)).filter(([field]) => fields.includes(field))
    )
    if (Object.keys(named).length) {
      showErrors(named)
    } else {
      toast.show({
        title: "Couldn't save",
        message: pageErrorSentence(err),
        variant: "error",
        position: "top-center",
      })
    }
  }

  const save = async () => {
    if (!dirty || saving) return
    const local = validate(form)
    if (Object.keys(local).length) {
      showErrors(local)
      return
    }

    setSaving(true)
    setErrors({})
    try {
      // The description first, then the facts: each only when it changed.
      if (descriptionChanged) {
        const text = form.description.trim()
        try {
          await updateAbout.mutateAsync(text)
        } catch (err) {
          refused(err, ["description"])
          return
        }
        setSaved((current) => ({ ...current, description: text }))
        setForm((current) => ({ ...current, description: text }))
      }

      if (factsChanged) {
        try {
          const settings = await updateFacts.mutateAsync(factChanges)
          // The server's answer is the truth: languages de-duplicated, days in order.
          const next = toForm("", settings.facts)
          setSaved((current) => ({ ...next, description: current.description }))
          setForm((current) => ({ ...next, description: current.description }))
        } catch (err) {
          refused(err, FIELD_ORDER.filter((field) => field !== "description"))
          return
        }
      }

      toast.show({ title: "Saved", variant: "success", position: "top-center" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageEditorLayout
      orgId={orgId}
      title={TITLE}
      dirty={dirty}
      save={{ saving, formId: FORM_ID }}
    >
      <form
        id={FORM_ID}
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <section className={styles.card} aria-labelledby={`${ids}-about`}>
          <h2 id={`${ids}-about`} className={styles.cardTitle}>
            About your {noun}
          </h2>
          <PageTextArea
            id={fieldId("description")}
            label="Description"
            rows={6}
            maxLength={ORG_DESCRIPTION_MAX}
            value={form.description}
            onChange={(event) => set("description", event.target.value, ["description"])}
            error={errors.description}
            hint="A couple of sentences: what you teach and who it's for."
            aside={
              <span className={styles.counter} aria-live="polite">
                {form.description.length} / {ORG_DESCRIPTION_MAX}
              </span>
            }
          />
        </section>

        <section id="facts" className={`${styles.card} ${styles.factsCard}`} aria-labelledby={`${ids}-facts`}>
          <h2 id={`${ids}-facts`} className={styles.cardTitle}>
            Key facts
          </h2>
          <p className={styles.cardIntro}>Fill in what applies. Anything left empty isn&apos;t shown.</p>

          <div className={styles.narrow}>
            <PageTextField
              id={fieldId("founded_year")}
              label="Founded"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="2015"
              value={form.founded}
              onChange={(event) => set("founded", digitsOnly(event.target.value, 4), ["founded_year"])}
              error={errors.founded_year}
            />
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={fieldStyles.label}>Ages you coach</legend>
            <div className={styles.ageRow}>
              <PageTextField
                id={fieldId("age_min")}
                label="From"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder={String(AGE_MIN)}
                value={form.ageFrom}
                onChange={(event) =>
                  set("ageFrom", digitsOnly(event.target.value, 2), ["age_min", "age_max"])
                }
                error={errors.age_min}
              />
              <span className={styles.ageDash} aria-hidden="true">
                –
              </span>
              <PageTextField
                id={fieldId("age_max")}
                label="To"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="18"
                value={form.ageTo}
                onChange={(event) =>
                  set("ageTo", digitsOnly(event.target.value, 2), ["age_min", "age_max"])
                }
                error={errors.age_max}
              />
            </div>
          </fieldset>

          <LanguageField
            id={fieldId("coaching_languages")}
            languages={form.languages}
            onChange={(next) => set("languages", next, ["coaching_languages"])}
            error={errors.coaching_languages}
          />

          <div className={fieldStyles.field} data-field="training_days">
            <span id={`${ids}-days-label`} className={fieldStyles.label}>
              Training days
            </span>
            <DayPicker
              value={form.days}
              onChange={(next) => set("days", next, ["training_days"])}
              labelledBy={`${ids}-days-label`}
              invalid={Boolean(errors.training_days)}
            />
            {errors.training_days && <FieldError>{errors.training_days}</FieldError>}
          </div>

          <div className={styles.narrow}>
            <Select
              id={fieldId("student_range")}
              label="Students"
              sheetTitle="Students"
              options={STUDENT_OPTIONS}
              value={form.students}
              onChange={(value) => set("students", value as StudentRange, ["student_range"])}
              error={errors.student_range}
            />
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={fieldStyles.label}>Links</legend>
            <div className={styles.links}>
              {SOCIAL.map(({ field, site, icon, placeholder }) => (
                <PageTextField
                  key={field}
                  id={fieldId(field)}
                  label={site}
                  icon={icon}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={form[field]}
                  onChange={(event) => set(field, event.target.value, [field])}
                  onBlur={(event) => {
                    const fixed = withHttps(event.target.value)
                    if (fixed !== event.target.value) set(field, fixed)
                  }}
                  error={errors[field]}
                />
              ))}
            </div>
          </fieldset>
        </section>
      </form>
    </PageEditorLayout>
  )
}
