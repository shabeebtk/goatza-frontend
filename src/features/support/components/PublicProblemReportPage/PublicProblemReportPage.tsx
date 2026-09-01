"use client"

/**
 * "Report a problem", filed without a session.
 *
 * A FULL PAGE, not the bottom sheet. Somebody who cannot log in is usually on a
 * broken or half-loaded app, and a page that stands on its own is more robust
 * than a sheet that needs app chrome to have mounted first. It is also a URL
 * that can be typed, linked from a support email, and reached when nothing else
 * in the app works.
 *
 * WHAT IS DELIBERATELY MISSING: screenshots. A presigned upload handed to an
 * anonymous caller is a write path into our bucket from the open internet, and
 * would need its own quarantine prefix and an orphan sweeper before it was
 * worth having. Logged-out reports are text-only.
 *
 * WHAT IS DELIBERATELY EXTRA: the contact email, which is required here and
 * optional in the sheet. There is no account to reply through.
 *
 * The category list is imported from the same `reportProblemMeta` the sheet
 * uses, so the two surfaces cannot drift into offering different options.
 */

import { useState } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { Icon } from "@iconify/react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button, Input } from "@/shared/components/ui"

import { PROBLEM_CATEGORIES } from "../../reportProblemMeta"
import { buildClientContext } from "../../services/clientContext"
import {
  PublicSupportApiError,
  submitPublicProblemReport,
} from "../../services/publicSupport.api"
import type { ProblemCategory } from "../../services/support.api"
import styles from "./PublicProblemReportPage.module.css"

/** Mirrors the backend's MIN/MAX_DESCRIPTION_LENGTH. */
const MIN_DESCRIPTION = 15
const MAX_DESCRIPTION = 2000

const CATEGORY_VALUES = PROBLEM_CATEGORIES.map((option) => option.value) as [
  ProblemCategory,
  ...ProblemCategory[],
]

const schema = z.object({
  category: z.enum(CATEGORY_VALUES, {
    message: "Pick what kind of problem this is",
  }),

  description: z
    .string()
    .trim()
    .min(MIN_DESCRIPTION, `Tell us a little more — at least ${MIN_DESCRIPTION} characters`)
    .max(MAX_DESCRIPTION, "That's longer than we can accept"),

  // Required HERE and not as a database rule: `reported_by` is SET_NULL on the
  // backend, so a constraint would fail the day somebody deletes their account
  // and an old authenticated report turns anonymous. This is the layer that
  // knows the difference.
  contact_email: z.string().trim().email("Enter an email we can reply to"),

  // The honeypot. Never validated and never read here — the backend decides
  // what a filled one means, and it answers a bot with the ordinary success
  // shape rather than telling it what gave the game away.
  website: z.string(),
})

type FormFields = z.infer<typeof schema>

/** Server field names that map onto an input on this form. */
const FORM_FIELDS = ["category", "description", "contact_email"] as const

export default function PublicProblemReportPage() {
  const [reference, setReference] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      // No preselected category: a default here would quietly file every
      // report anybody skipped past under one label.
      category: undefined,
      description: "",
      contact_email: "",
      website: "",
    },
  })

  const description = watch("description") ?? ""

  const onSubmit = async (values: FormFields) => {
    setFormError(null)

    try {
      const result = await submitPublicProblemReport({
        category: values.category,
        description: values.description.trim(),
        contact_email: values.contact_email.trim(),
        // No `actor_type`: there is no actor. The store's default would say
        // "user", which from a visitor with no session is a value that reads
        // like a fact and is not one.
        client_context: buildClientContext({ includeActorType: false }),
        // ALWAYS sent, blank or not. A field that only appears when it is
        // filled tells a bot which submissions were caught.
        website: values.website,
      })

      setReference(result.reference)
    } catch (error) {
      // Nothing is cleared and nothing is reset. Whatever failed, the form is
      // still exactly as it was typed — for somebody already dealing with a
      // broken app, that is the difference between a retry and giving up.
      if (!(error instanceof PublicSupportApiError)) {
        setFormError(
          "Couldn't reach us just now. Check your connection and try again.",
        )
        return
      }

      const { fieldErrors } = error
      let placed = false

      for (const field of FORM_FIELDS) {
        const message = fieldErrors[field]
        if (message) {
          setError(field, { type: "server", message })
          placed = true
        }
      }

      if (!placed) setFormError(error.message)
    }
  }

  // ── Sent ───────────────────────────────────────────────────
  //
  // Rendered inline, and NO REDIRECT. Somebody who got here because login is
  // broken has nowhere useful to be sent, and sending them back to the thing
  // that failed would lose the reference code on the way.
  if (reference) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.done}>
            <span className={styles.doneMark} aria-hidden="true">
              <Icon icon="mdi:check" width={26} height={26} />
            </span>

            <h1 className={styles.doneTitle}>Thanks — we got it</h1>
            <p className={styles.doneText}>
              Our team will look into this, and may email you if we need more to
              go on.
            </p>

            <p className={styles.reference}>{reference}</p>
            <p className={styles.referenceNote}>
              Quote this code if you write to us about it.
            </p>

            <Link href="/auth" className={styles.backLink}>
              Back to log in
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // ── Form ───────────────────────────────────────────────────

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.head}>
          <h1 className={styles.title}>Report a problem</h1>
          <p className={styles.subtitle}>
            Something in Goatza is broken and you can&apos;t sign in to tell us?
            Tell us here.
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
          {/* The same seven options as the in-app sheet, from the same file. */}
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>What went wrong?</legend>

            <div className={styles.options}>
              {PROBLEM_CATEGORIES.map((option) => (
                <label key={option.value} className={styles.option}>
                  <input
                    type="radio"
                    value={option.value}
                    className={styles.optionInput}
                    {...register("category")}
                  />
                  <span className={styles.radio} aria-hidden="true">
                    <span className={styles.radioDot} />
                  </span>
                  <span className={styles.optionLabel}>{option.label}</span>
                </label>
              ))}
            </div>

            {errors.category?.message && (
              <p className={styles.errorMsg} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
                {errors.category.message}
              </p>
            )}
          </fieldset>

          <div className={styles.field}>
            <Input
              as="textarea"
              label="What happened?"
              required
              rows={6}
              maxLength={MAX_DESCRIPTION}
              placeholder="I enter my password and the button just spins…"
              {...register("description")}
              error={errors.description?.message}
            />
            <span className={styles.counter}>
              {description.trim().length}/{MAX_DESCRIPTION}
            </span>
          </div>

          <Input
            label="Your email"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            helperText="So we can reply about this report."
            {...register("contact_email")}
            error={errors.contact_email?.message}
          />

          {/*
            Hidden from people, left in the DOM for the things that fill every
            input they find. Off-screen rather than `display: none` — the bots
            worth catching skip fields the browser would not render at all —
            out of the tab order, hidden from screen readers, and autofill told
            to leave it alone so a browser cannot trip it on somebody's behalf.
          */}
          <div className={styles.offscreen}>
            <label htmlFor="website">Website</label>
            <input
              id="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              {...register("website")}
            />
          </div>

          {/* Say what we take. Not a control — there is nothing to opt out of,
              and pretending otherwise would be worse than saying so. */}
          <p className={styles.autoNote}>
            <Icon icon="mdi:information-outline" width={15} height={15} />
            Attached automatically: page, device, browser, app version
          </p>

          {formError && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
              {formError}
            </p>
          )}

          <Button type="submit" fullWidth loading={isSubmitting}>
            Send report
          </Button>
        </form>

        <p className={styles.footNote}>
          Reporting a person or a post?{" "}
          <Link href="/auth" className={styles.footLink}>
            Log in
          </Link>{" "}
          and use the ⋯ menu — those reports go to a different team.
        </p>
      </div>
    </main>
  )
}
