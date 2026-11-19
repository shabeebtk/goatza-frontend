"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useOrgDetail } from "@/features/organization/hooks/useOrganizations"
import type { OrgLocation, OrgSport } from "@/features/organization/types"
import Button from "@/shared/components/ui/Button/Button"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import Select from "@/shared/components/ui/Select/Select"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { ORG_PERMISSIONS } from "@/shared/permissions/orgPermissions"
import { FEE_PER_LABELS, PROGRAM_LEVEL_LABELS, formatBranch } from "../../format"
import { useCreateProgram, useDeleteProgram, usePrograms, useUpdateProgram } from "../../hooks/usePrograms"
import { pageErrorCode, pageErrorSentence, pageFieldErrors } from "../../pageErrors"
import {
  buildProgramPayload,
  changedProgramFields,
  emptyProgramValues,
  programSchema,
  programToValues,
  sportsInOrder,
  type ProgramFormValues,
} from "../../programForm"
import { orgAdminBase, pageBase } from "../../sectionMeta"
import type { FeePer, Program, ProgramLevel, ProgramSpots } from "../../types"
import DayPicker from "../DayPicker/DayPicker"
import PageEditorLayout from "../PageEditorLayout/PageEditorLayout"
import { FieldError, PageTextField } from "../PageFields/PageFields"
import fieldStyles from "../PageFields/PageFields.module.css"
import PageSegmented from "../PageSegmented/PageSegmented"
import PageSwitch from "../PageSwitch/PageSwitch"
import ProgramCard, { type ProgramCardData } from "../ProgramCard/ProgramCard"
import RequirePagePermission from "../RequirePagePermission/RequirePagePermission"
import styles from "./ProgramEditorPage.module.css"

const FORM_ID = "page-program-form"

const LEVEL_OPTIONS = (Object.keys(PROGRAM_LEVEL_LABELS) as ProgramLevel[]).map((value) => ({
  value,
  label: PROGRAM_LEVEL_LABELS[value],
}))

const SPOTS_OPTIONS: { value: ProgramSpots; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "few", label: "Few left" },
  { value: "full", label: "Full" },
]

const FEE_PER_OPTIONS = (Object.keys(FEE_PER_LABELS) as FeePer[]).map((value) => ({
  value,
  label: FEE_PER_LABELS[value],
}))

/** Top to bottom: the first error is the one scrolled to. */
const FIELD_ORDER: (keyof ProgramFormValues)[] = [
  "name",
  "sport_id",
  "age_min",
  "age_max",
  "level",
  "days",
  "start_time",
  "end_time",
  "location_id",
  "fee_mode",
  "fee_amount",
  "fee_per",
  "free_trial",
  "spots",
]

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max)

export default function ProgramEditorPage({ orgId, programId }: { orgId: string; programId?: string }) {
  return (
    <RequirePagePermission orgId={orgId} permission={ORG_PERMISSIONS.PAGE_MANAGE}>
      <ProgramEditorLoader orgId={orgId} programId={programId} />
    </RequirePagePermission>
  )
}

function ProgramEditorLoader({ orgId, programId }: { orgId: string; programId?: string }) {
  const detail = useOrgDetail(orgId)
  const programs = usePrograms(orgId)
  const title = programId ? "Edit program" : "New program"
  const listHref = `${pageBase(orgId)}/programs`
  const back = { fallback: listHref, label: "Back to programs" }

  const frame = (children: ReactNode) => (
    <PageEditorLayout orgId={orgId} title={title} back={back}>
      {children}
    </PageEditorLayout>
  )

  if (detail.isLoading || programs.isLoading) {
    return frame(
      <div className={styles.skeleton} aria-hidden="true">
        <span style={{ height: 420 }} />
        <span style={{ height: 300 }} />
      </div>
    )
  }

  if (!detail.data || !programs.data) {
    return frame(
      <div className={styles.state} role="alert">
        <Icon icon="mdi:alert-circle-outline" width={36} height={36} aria-hidden="true" />
        <p>Couldn&apos;t load this program.</p>
        <Button
          variant="outline"
          loading={detail.isRefetching || programs.isRefetching}
          onClick={() => {
            void detail.refetch()
            void programs.refetch()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  const program = programId ? programs.data.find((item) => item.id === programId) : undefined
  if (programId && !program) {
    return frame(
      <div className={styles.state} role="status">
        <Icon icon="mdi:clipboard-remove-outline" width={36} height={36} aria-hidden="true" />
        <p>This program isn&apos;t there any more.</p>
        <Button variant="outline" href={listHref}>
          Back to programs
        </Button>
      </div>
    )
  }

  const sports = sportsInOrder(detail.data.sports ?? [])
  if (!program && sports.length === 0) {
    return frame(
      <div className={styles.state} role="status">
        <Icon icon="mdi:soccer" width={36} height={36} aria-hidden="true" />
        <p>Add a sport to your page first.</p>
        <Button variant="brand" href={`${orgAdminBase(orgId)}/profile?edit=profile`}>
          Add a sport
        </Button>
      </div>
    )
  }

  return (
    <ProgramEditor
      key={program?.id ?? "new"}
      orgId={orgId}
      program={program}
      sports={sports}
      locations={detail.data.locations ?? []}
    />
  )
}

function ProgramEditor({
  orgId,
  program,
  sports,
  locations,
}: {
  orgId: string
  program?: Program
  sports: OrgSport[]
  locations: OrgLocation[]
}) {
  const router = useRouter()
  const toast = useToast()
  const ids = useId()
  const fieldId = (field: string) => `${ids}-${field}`
  const listHref = `${pageBase(orgId)}/programs`

  const create = useCreateProgram(orgId)
  const update = useUpdateProgram(orgId, program?.id ?? "")
  const remove = useDeleteProgram(orgId)
  const [askDelete, setAskDelete] = useState(false)

  const [saved, setSaved] = useState<ProgramFormValues>(() =>
    program ? programToValues(program) : emptyProgramValues({ sports, locations })
  )
  const schema = useMemo(() => programSchema({ needsSport: sports.length > 1 }), [sports.length])

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProgramFormValues>({
    resolver: zodResolver(schema) as Resolver<ProgramFormValues>,
    defaultValues: saved,
    shouldFocusError: false,
  })
  const values = useWatch({ control }) as ProgramFormValues
  const saving = create.isPending || update.isPending

  const scrollToFirst = (fieldErrors: Partial<Record<string, unknown>>) => {
    const first = FIELD_ORDER.find((field) => fieldErrors[field])
    if (!first) return
    const element = document.getElementById(fieldId(first))
    element?.scrollIntoView({ block: "center" })
    const focusable =
      element instanceof HTMLInputElement || element instanceof HTMLButtonElement
        ? element
        : element?.querySelector<HTMLElement>("input, button")
    focusable?.focus({ preventScroll: true })
  }

  const refused = (err: unknown) => {
    const fieldErrors = pageFieldErrors(err)
    const known = Object.entries(fieldErrors).filter(([field]) =>
      (FIELD_ORDER as string[]).includes(field)
    )
    if (known.length) {
      for (const [field, message] of known) {
        setError(field as keyof ProgramFormValues, { type: "server", message })
      }
      scrollToFirst(Object.fromEntries(known))
      return
    }
    toast.show({
      title: pageErrorCode(err) === "no_sport" ? "Add a sport first" : "Couldn't save the program",
      message: pageErrorSentence(err),
      variant: "error",
      position: "top-center",
    })
  }

  const onValid = (next: ProgramFormValues) => {
    const payload = buildProgramPayload(next, { sports })

    if (!program) {
      create.mutate(payload, {
        onSuccess: () => {
          reset(next)
          toast.show({ title: "Program added", variant: "success", position: "top-center" })
          router.replace(listHref)
        },
        onError: refused,
      })
      return
    }

    const changes = changedProgramFields(payload, buildProgramPayload(saved, { sports }))
    if (Object.keys(changes).length === 0) {
      reset(next)
      return
    }
    update.mutate(changes, {
      onSuccess: (answer) => {
        const fresh = programToValues(answer)
        setSaved(fresh)
        reset(fresh)
        toast.show({ title: "Program saved", variant: "success", position: "top-center" })
      },
      onError: refused,
    })
  }

  const onInvalid = (fieldErrors: FieldErrors<ProgramFormValues>) => scrollToFirst(fieldErrors)

  const preview: ProgramCardData = {
    name: values.name ?? "",
    age_min: /^\d+$/.test(values.age_min ?? "") ? Number(values.age_min) : null,
    age_max: /^\d+$/.test(values.age_max ?? "") ? Number(values.age_max) : null,
    level: values.level,
    days: values.days ?? [],
    start_time: values.start_time ?? "",
    end_time: values.end_time ?? "",
    location: locations.find((location) => location.id === values.location_id) ?? null,
    fee: {
      mode: values.fee_mode,
      amount:
        values.fee_mode === "amount" && /^\d+$/.test((values.fee_amount ?? "").replace(/[,\s]/g, ""))
          ? Number(values.fee_amount.replace(/[,\s]/g, ""))
          : null,
      per: values.fee_mode === "amount" ? values.fee_per : null,
    },
    free_trial: Boolean(values.free_trial),
    spots: values.spots,
  }

  const branchOptions = [
    ...[...locations]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((location) => ({ value: location.id, label: formatBranch(location) || "Branch" })),
    { value: "", label: "No branch" },
  ]

  return (
    <PageEditorLayout
      orgId={orgId}
      title={program ? "Edit program" : "New program"}
      back={{ fallback: listHref, label: "Back to programs" }}
      dirty={isDirty}
      wide
      save={{ saving, formId: FORM_ID, label: "Save program" }}
    >
      <div className={styles.layout}>
        <form
          id={FORM_ID}
          className={styles.form}
          noValidate
          onSubmit={handleSubmit(onValid, onInvalid)}
        >
          <section className={styles.card} aria-label="The program">
            <PageTextField
              id={fieldId("name")}
              label="Program name"
              placeholder="U12 Football Foundation"
              maxLength={80}
              autoComplete="off"
              error={errors.name?.message}
              {...register("name")}
            />

            {sports.length > 1 && (
              <Controller
                control={control}
                name="sport_id"
                render={({ field }) => (
                  <Select
                    id={fieldId("sport_id")}
                    label="Sport"
                    sheetTitle="Sport"
                    options={sports.map((sport) => ({ value: sport.id, label: sport.name }))}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.sport_id?.message}
                  />
                )}
              />
            )}

            <fieldset className={styles.fieldset}>
              <legend className={fieldStyles.label}>Ages</legend>
              <div className={styles.pair}>
                <Controller
                  control={control}
                  name="age_min"
                  render={({ field }) => (
                    <PageTextField
                      id={fieldId("age_min")}
                      label="From"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="8"
                      value={field.value}
                      onChange={(event) => field.onChange(digitsOnly(event.target.value, 2))}
                      onBlur={field.onBlur}
                      error={errors.age_min?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="age_max"
                  render={({ field }) => (
                    <PageTextField
                      id={fieldId("age_max")}
                      label="To"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="12"
                      value={field.value}
                      onChange={(event) => field.onChange(digitsOnly(event.target.value, 2))}
                      onBlur={field.onBlur}
                      error={errors.age_max?.message}
                    />
                  )}
                />
              </div>
            </fieldset>

            <div className={fieldStyles.field}>
              <span id={`${ids}-level-label`} className={fieldStyles.label}>
                Level
              </span>
              <Controller
                control={control}
                name="level"
                render={({ field }) => (
                  <PageSegmented
                    id={fieldId("level")}
                    labelledBy={`${ids}-level-label`}
                    options={LEVEL_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </section>

          <section className={styles.card} aria-label="When and where">
            <div className={fieldStyles.field} id={fieldId("days")}>
              <span id={`${ids}-days-label`} className={fieldStyles.label}>
                Training days
              </span>
              <Controller
                control={control}
                name="days"
                render={({ field }) => (
                  <DayPicker
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy={`${ids}-days-label`}
                    describedBy={errors.days ? `${ids}-days-error` : undefined}
                    invalid={Boolean(errors.days)}
                  />
                )}
              />
              {errors.days?.message && <FieldError id={`${ids}-days-error`}>{errors.days.message}</FieldError>}
            </div>

            <div className={styles.pair}>
              <PageTextField
                id={fieldId("start_time")}
                label="Starts"
                type="time"
                error={errors.start_time?.message}
                {...register("start_time")}
              />
              <PageTextField
                id={fieldId("end_time")}
                label="Ends"
                type="time"
                error={errors.end_time?.message}
                {...register("end_time")}
              />
            </div>

            {locations.length > 0 ? (
              <Controller
                control={control}
                name="location_id"
                render={({ field }) => (
                  <Select
                    id={fieldId("location_id")}
                    label="Branch"
                    sheetTitle="Branch"
                    options={branchOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.location_id?.message}
                  />
                )}
              />
            ) : (
              <p className={styles.note}>
                No branches yet.{" "}
                <Link href={`${orgAdminBase(orgId)}/profile?edit=profile`} className={styles.noteLink}>
                  Add a location
                </Link>{" "}
                to say where this runs.
              </p>
            )}
          </section>

          <section className={styles.card} aria-label="Fee and places">
            <div className={fieldStyles.field}>
              <span id={`${ids}-fee-label`} className={fieldStyles.label}>
                Fee
              </span>
              <Controller
                control={control}
                name="fee_mode"
                render={({ field }) => (
                  <PageSegmented
                    id={fieldId("fee_mode")}
                    labelledBy={`${ids}-fee-label`}
                    options={[
                      { value: "amount", label: "Show the fee" },
                      { value: "contact", label: "Contact for fees" },
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            {values.fee_mode === "amount" && (
              <div className={styles.feeRow}>
                <Controller
                  control={control}
                  name="fee_amount"
                  render={({ field }) => (
                    <PageTextField
                      id={fieldId("fee_amount")}
                      label="Amount"
                      icon="mdi:currency-inr"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="1500"
                      value={field.value}
                      onChange={(event) => field.onChange(digitsOnly(event.target.value, 7))}
                      onBlur={field.onBlur}
                      error={errors.fee_amount?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="fee_per"
                  render={({ field }) => (
                    <Select
                      id={fieldId("fee_per")}
                      label="Charged"
                      sheetTitle="How often it's charged"
                      options={FEE_PER_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.fee_per?.message}
                    />
                  )}
                />
              </div>
            )}

            <Controller
              control={control}
              name="free_trial"
              render={({ field }) => (
                <div className={styles.switchRow} id={fieldId("free_trial")}>
                  <span className={styles.switchText}>
                    <span className={styles.switchLabel}>Free trial session</span>
                    <span id={`${ids}-trial-hint`} className={styles.switchHint}>
                      Shows a Free trial badge
                    </span>
                  </span>
                  <PageSwitch
                    label="Free trial session"
                    describedBy={`${ids}-trial-hint`}
                    checked={field.value}
                    onChange={field.onChange}
                  />
                </div>
              )}
            />

            <div className={fieldStyles.field}>
              <span id={`${ids}-spots-label`} className={fieldStyles.label}>
                Spots
              </span>
              <Controller
                control={control}
                name="spots"
                render={({ field }) => (
                  <PageSegmented
                    id={fieldId("spots")}
                    labelledBy={`${ids}-spots-label`}
                    options={SPOTS_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </section>

          {program && (
            <div className={styles.dangerZone}>
              <Button
                variant="ghost"
                className={styles.deleteButton}
                loading={remove.isPending}
                leftIcon={<Icon icon="mdi:trash-can-outline" width={18} height={18} />}
                onClick={() => setAskDelete(true)}
              >
                Delete program
              </Button>
            </div>
          )}
        </form>

        <aside className={styles.preview} aria-label="How it looks on your page">
          <h2 className={styles.previewTitle}>How it looks on your page</h2>
          <ProgramCard program={preview} />
        </aside>
      </div>

      {program && (
        <ConfirmDialog
          open={askDelete}
          title="Delete this program?"
          message="Enquiries that named it keep its name."
          confirmLabel="Delete"
          cancelLabel="Keep it"
          tone="danger"
          onConfirm={() => {
            setAskDelete(false)
            remove.mutate(program.id, {
              onSuccess: () => {
                reset(saved)
                toast.show({ title: "Program deleted", variant: "success", position: "top-center" })
                router.replace(listHref)
              },
              onError: (err) =>
                toast.show({
                  title: "Couldn't delete it",
                  message: pageErrorSentence(err),
                  variant: "error",
                  position: "top-center",
                }),
            })
          }}
          onCancel={() => setAskDelete(false)}
        />
      )}
    </PageEditorLayout>
  )
}
