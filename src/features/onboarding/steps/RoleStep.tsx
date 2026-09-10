"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { Button } from "@/shared/components/ui"
import RoleSelect from "@/features/auth/components/RoleSelect/RoleSelect"
import DateOfBirthInput, {
  dateOfBirthSchema,
} from "@/shared/components/DateOfBirthInput"
import CountrySelect, {
  defaultCountryCode,
} from "@/shared/components/CountrySelect"
import {
  ageRefusalMessage,
  isUnderAgeError,
  rememberAgeRefusal,
} from "@/features/auth/services/ageGate"
import { useSetRole } from "@/features/auth/hooks/useAuthMutations"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import type { UserRole } from "@/shared/constants/roles"
import StepScaffold from "./StepScaffold"
import styles from "../components/OnboardingModal.module.css"

/**
 * Step 1 — Role. Prefilled from the user's current role. "Continue" only hits the
 * API when the role actually changed or was never confirmed (new Google users);
 * otherwise it just advances. Selecting a role also sets the branch (player → full
 * flow, others → identity then done).
 *
 * IT IS ALSO WHERE GOOGLE USERS ARE ASKED THEIR AGE. A Google account is
 * created straight from the OAuth callback — no form, so no role, no consent
 * and no date of birth. All three are collected here, at the step a new Google
 * user cannot skip, because there is no other point in the flow that asks them
 * anything. Every field below is conditional on the user actually still owing
 * it, so an email signup or a later role change sees only the role cards.
 */
export default function RoleStep({ onNext }: { onNext: () => void }) {
  const user = useAuthStore((s) => s.user)
  const setRoleMutation = useSetRole()

  const role = useOnboardingStore((s) => s.role)
  const setStoreRole = useOnboardingStore((s) => s.setRole)

  const [apiError, setApiError] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // Age and jurisdiction, asked here for the same reason consent is: a Google
  // account is created without anyone being asked anything, so this step — the
  // one they cannot skip — is where both are collected. Prefilled the same way
  // the signup form prefills its country.
  const [birthdate, setBirthdate] = useState("")
  // Derived from the number on the account when there is one, India otherwise.
  // Seeded once at mount rather than watched: this is a starting point, and
  // re-deriving it later would fight a user who has already changed it.
  const [countryCode, setCountryCode] = useState(() =>
    defaultCountryCode(user?.phone),
  )
  const [birthdateError, setBirthdateError] = useState<string | null>(null)

  /**
   * A brand-new Google account, and the only kind of user who reaches this
   * step without having agreed to anything.
   *
   * Email signups tick the box on the form and arrive with consent already on
   * file; is_role_confirmed is true for them because they chose a role there.
   * A Google account is created with is_role_confirmed FALSE and nothing
   * accepted — the button they pressed was on Google's screen, not ours — so
   * this step, which they cannot skip, is where they are actually asked.
   */
  const needsConsent = user?.is_role_confirmed === false

  /**
   * Whether this user still owes an age and a jurisdiction.
   *
   * Keyed on `country_code` because the two are always written together — the
   * signup form captures both in one transaction, and so does this step — so
   * an empty country is a faithful stand-in for "no age on file", and the
   * birthdate itself is not on the session user. The backend decides for
   * certain; this only decides whether to render the fields, and it sends them
   * whenever it has them, so a disagreement costs nothing.
   */
  const needsAge = !user?.country_code

  const handleChange = (next: UserRole) => {
    setApiError(null)
    setStoreRole(next)
  }

  const handleContinue = async () => {
    if (!role) return
    setApiError(null)
    setBirthdateError(null)

    if (needsAge) {
      // Same client-side rule as the signup form: a real, past calendar date,
      // and deliberately no minimum age — the server's refusal never names the
      // limit and this must not name it either.
      const parsed = dateOfBirthSchema.safeParse(birthdate)
      if (!parsed.success) {
        setBirthdateError(parsed.error.issues[0]?.message ?? "Check this date")
        return
      }

      const blocked = ageRefusalMessage()
      if (blocked) {
        setApiError(blocked)
        return
      }
    }

    // New Google users (is_role_confirmed === false) must persist a role; everyone
    // else only needs the API call when they actually changed it — unless they
    // still owe an age, which only this call can record.
    const mustSave =
      user?.is_role_confirmed === false || role !== user?.role || needsAge

    if (!mustSave) {
      onNext()
      return
    }

    try {
      await setRoleMutation.mutateAsync({
        role,
        // Only sent when this user still owes consent. The backend requires it
        // in exactly that case and ignores it otherwise, so an existing user
        // changing role mid-onboarding is unaffected.
        acceptedTerms: needsConsent ? acceptedTerms : undefined,
        // Same conditional shape, same reason.
        birthdate: needsAge ? birthdate : undefined,
        countryCode: needsAge ? countryCode.toUpperCase() : undefined,
      })
      onNext()
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Couldn't save your role. Please try again."

      // The under-13 refusal, remembered on this device so the retry with a
      // different year is not one click away. The server's own wording is
      // shown unchanged — it names no age limit, and rewording it here is
      // where that would leak back in.
      if (isUnderAgeError(err)) rememberAgeRefusal(msg)

      setApiError(msg)
    }
  }

  return (
    <StepScaffold
      icon="mdi:account-star-outline"
      title="How will you use Goatza?"
      subtitle="Pick the role that fits you best — you can build out your profile next."
      footer={
        <Button
          variant="brand"
          size="lg"
          fullWidth
          disabled={
            !role ||
            (needsConsent && !acceptedTerms) ||
            (needsAge && (!birthdate || !countryCode))
          }
          loading={setRoleMutation.isPending}
          onClick={handleContinue}
        >
          Continue →
        </Button>
      }
    >
      <RoleSelect
        value={role}
        onChange={handleChange}
        disabled={setRoleMutation.isPending}
      />

      {needsAge && (
        <div className={styles.ageFields}>
          <DateOfBirthInput
            value={birthdate}
            onChange={(next) => {
              setBirthdate(next)
              setBirthdateError(null)
            }}
            disabled={setRoleMutation.isPending}
            error={birthdateError ?? undefined}
            /*
              ONE line. It says why the field helps the user, not what it
              decides — "to check if you're a minor" would tell somebody
              exactly what to lie about, and a fiction here is worse than a
              blank, because it looks like an answer.
            */
          />

          <CountrySelect
            value={countryCode}
            onChange={setCountryCode}
            disabled={setRoleMutation.isPending}
          />
        </div>
      )}

      {needsConsent && (
        <div className={styles.consentField}>
          <label className={styles.consentLabel}>
            <input
              type="checkbox"
              className={styles.consentBox}
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              disabled={setRoleMutation.isPending}
            />
            <span className={styles.consentText}>
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.consentLink}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.consentLink}
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </div>
      )}

      {apiError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}
    </StepScaffold>
  )
}
