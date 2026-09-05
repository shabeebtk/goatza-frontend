"use client"

/**
 * The delete-account confirmation.
 *
 * Two server round trips, and the modal is the thing that sequences them:
 * initiate on open says WHICH credential this account confirms with (a
 * password, or a code mailed to the address on file), confirm spends it.
 *
 * Both calls draw on ONE budget of three per hour
 * (accounts/throttles.py::AccountDeleteThrottle), which is why initiate fires
 * exactly once per open and never retries — reopening the modal three times
 * would otherwise lock a user out of deleting their own account for an hour
 * without them having typed anything.
 *
 * Portal + bottom-sheet-on-mobile / centred-card-on-desktop, matching
 * LegalConsentModal, so it reads as part of the app rather than as something
 * that has gone wrong.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Icon } from "@iconify/react"
import { useQueryClient } from "@tanstack/react-query"

import { Button, Input } from "@/shared/components/ui"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useFocusTrap } from "@/features/onboarding/hooks/useFocusTrap"
import { useAuthStore } from "@/store/auth.store"
import {
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  readAccountDeleteError,
  type AccountDeleteFailure,
  type AccountDeleteMethod,
} from "../../services/accountDeletion.api"
import {
  useConfirmAccountDelete,
  useInitiateAccountDelete,
} from "../../hooks/useAccountDeletion"
import styles from "./DeleteAccountModal.module.css"

/** Shown for both endpoints' 429 — the wait is an hour, not something to retry into. */
const THROTTLED_MESSAGE = "Too many attempts. Please try again later."

/**
 * How long the farewell stays up before the page goes.
 *
 * A toast cannot survive the hard redirect that follows it, so the redirect
 * waits for the toast rather than the other way round.
 */
const FAREWELL_MS = 2200

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────

export default function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  // Fires once on mount and owns its own state — see the hook for why this is
  // deliberately not a React Query mutation.
  const initiate = useInitiateAccountDelete()

  /** The account is gone and the page is on its way out — nothing may close now. */
  const [leaving, setLeaving] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  // Lock body scroll while open — same as every other sheet here.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const dismissable = !leaving && initiate.phase !== "loading"

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dismissable, onClose])

  const farewellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (farewellTimer.current) clearTimeout(farewellTimer.current)
    },
    []
  )

  /**
   * The account is deactivated. What is left is local: say goodbye, drop every
   * trace of the session, and leave.
   */
  const handleDeleted = () => {
    setLeaving(true)

    toast.show({
      title: "Your account has been deleted",
      message: "Thanks for being part of Goatza. We're sorry to see you go.",
      variant: "success",
      duration: FAREWELL_MS,
    })

    farewellTimer.current = setTimeout(() => {
      // Exactly what useLogout does, minus the /user/logout call: confirm has
      // already blacklisted every refresh token and cleared the refresh
      // cookie, so there is no session left to retire.
      clearAuth()
      queryClient.clear()

      // Hard, not router.push. Clearing the store is what makes AuthGuard
      // bounce to /auth, so a client navigation would be racing it — and
      // nothing in this tree should outlive the account it belonged to.
      window.location.href = "/"
    }, FAREWELL_MS)
  }

  const failure: AccountDeleteFailure | null =
    initiate.phase === "failed" ? initiate.failure : null

  const backdropRef = useRef<HTMLDivElement>(null)
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current && dismissable) onClose()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className={styles.modal} ref={containerRef} tabIndex={-1}>
        <span className={styles.mark} aria-hidden="true">
          <Icon icon="mdi:delete-forever-outline" width={26} height={26} />
        </span>

        {/* ── Waiting on initiate ── */}
        {initiate.phase === "loading" && (
          <>
            <h2 className={styles.title} id="delete-account-title">
              Delete account
            </h2>
            <p className={styles.body}>
              Checking how to confirm it&rsquo;s you&hellip;
            </p>
            <span className={styles.spinner} aria-hidden="true" />
          </>
        )}

        {/* ── Blocked: the user still owns an organization outright ── */}
        {failure?.kind === "sole_owner" && (
          <SoleOwnerBlock
            organizations={failure.organizations}
            onClose={onClose}
          />
        )}

        {/* ── Blocked: out of attempts ── */}
        {failure?.kind === "throttled" && (
          <>
            <h2 className={styles.title} id="delete-account-title">
              Too many attempts
            </h2>
            <p className={styles.body}>
              {THROTTLED_MESSAGE} For your security this is limited to a few
              attempts an hour.
            </p>
            <Button variant="outline" size="lg" fullWidth onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {/* ── Anything else initiate could say ── */}
        {failure?.kind === "message" && (
          <>
            <h2 className={styles.title} id="delete-account-title">
              Delete account
            </h2>
            <p className={styles.error} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
              {failure.message}
            </p>
            <Button variant="outline" size="lg" fullWidth onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {/* ── The real thing ── */}
        {initiate.phase === "ready" && (
          <ConfirmStep
            method={initiate.method}
            sentTo={initiate.sentTo}
            leaving={leaving}
            onDeleted={handleDeleted}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────
// SOLE-OWNER BLOCK
// ─────────────────────────────────────────────

/**
 * The one refusal that is not about credentials: an organization whose only
 * owner leaves is unadministrable, so the app refuses at the door.
 *
 * Names first and the instruction under them — the user's question here is
 * "which ones?", and answering it is what makes the next step obvious.
 * Transferring ownership is deliberately not offered from here: it happens in
 * each organization's own member settings, where the members are.
 */
function SoleOwnerBlock({
  organizations,
  onClose,
}: {
  organizations: string[]
  onClose: () => void
}) {
  const many = organizations.length > 1

  return (
    <>
      <h2 className={styles.title} id="delete-account-title">
        Transfer ownership first
      </h2>

      <p className={styles.body}>
        You&rsquo;re the only owner of{" "}
        {many ? "these organizations" : "this organization"}, so deleting your
        account would leave {many ? "them" : "it"} with nobody in charge:
      </p>

      <OrganizationList organizations={organizations} />

      <p className={styles.hint}>
        Make someone else an owner in{" "}
        {many ? "each organization's" : "the organization's"} member settings,
        then come back and delete your account.
      </p>

      <Button variant="outline" size="lg" fullWidth onClick={onClose}>
        Close
      </Button>
    </>
  )
}

function OrganizationList({ organizations }: { organizations: string[] }) {
  return (
    <ul className={styles.orgList}>
      {organizations.map((name) => (
        <li key={name} className={styles.orgItem}>
          <Icon
            icon="mdi:shield-account-outline"
            width={16}
            height={16}
            aria-hidden="true"
          />
          <span>{name}</span>
        </li>
      ))}
    </ul>
  )
}

// ─────────────────────────────────────────────
// CONFIRM STEP
// ─────────────────────────────────────────────

type ConfirmFields = {
  credential: string
  acknowledged: true
}

/**
 * Built per method so the resolver is fixed for the life of the form — the
 * modal only mounts this once initiate has said which credential applies.
 */
const schemaFor = (method: AccountDeleteMethod) =>
  z.object({
    credential:
      method === "password"
        ? z.string().min(1, "Enter your password")
        : z
            .string()
            .min(OTP_MIN_LENGTH, "Enter the code")
            .max(OTP_MAX_LENGTH, "Code too long")
            .regex(/^\d+$/, "Code must be numeric"),
    // z.literal(true), not z.boolean(): the only value that passes is a
    // deliberate tick. Same shape as the signup consent box.
    acknowledged: z.literal(true, {
      error: "Please confirm you understand this cannot be undone",
    }),
  })

function ConfirmStep({
  method,
  sentTo,
  leaving,
  onDeleted,
  onClose,
}: {
  method: AccountDeleteMethod
  sentTo?: string
  leaving: boolean
  onDeleted: () => void
  onClose: () => void
}) {
  const confirm = useConfirmAccountDelete()

  const [failure, setFailure] = useState<AccountDeleteFailure | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConfirmFields>({
    resolver: zodResolver(schemaFor(method)),
    defaultValues: {
      credential: "",
      // Starts false and is never seeded from anywhere — same as the signup
      // consent box it borrows its shape from.
      acknowledged: false as unknown as true,
    },
  })

  const acknowledged = watch("acknowledged") === true

  // Out of attempts: the answer is an hour's wait, so the button stays down
  // rather than inviting a fourth try that cannot succeed.
  const throttled = failure?.kind === "throttled"

  const busy = confirm.isPending || leaving

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)

    const payload =
      method === "password"
        ? { password: values.credential }
        : { otp: values.credential }

    try {
      await confirm.mutateAsync(payload)
      onDeleted()
    } catch (err) {
      setFailure(readAccountDeleteError(err))
    }
  })

  return (
    <>
      <h2 className={styles.title} id="delete-account-title">
        Delete your account?
      </h2>

      <p className={styles.body}>
        Your account is deactivated straight away and permanently erased after 30
        days.{" "}
        {method === "password"
          ? "Enter your password to confirm."
          : "Enter the code we sent you to confirm."}
      </p>

      {method === "otp" && sentTo && (
        <p className={styles.sentTo}>
          <Icon
            icon="mdi:email-outline"
            width={15}
            height={15}
            aria-hidden="true"
          />
          We sent a code to <strong>{sentTo}</strong>
        </p>
      )}

      {failure && failure.kind !== "sole_owner" && (
        <p className={styles.error} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {failure.kind === "throttled" ? THROTTLED_MESSAGE : failure.message}
        </p>
      )}

      {/* The guard can also fire on confirm — an organization can lose its
          other owner between the two calls — so the names get the same
          treatment here. */}
      {failure?.kind === "sole_owner" && (
        <>
          <p className={styles.error} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            You&rsquo;re the only owner of{" "}
            {failure.organizations.length > 1
              ? "these organizations"
              : "this organization"}
            :
          </p>
          <OrganizationList organizations={failure.organizations} />
          <p className={styles.hint}>
            Make someone else an owner in their member settings, then come back.
          </p>
        </>
      )}

      <form onSubmit={onSubmit} className={styles.form} noValidate>
        {method === "password" ? (
          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={busy}
            leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
            {...register("credential")}
            error={errors.credential?.message}
          />
        ) : (
          <Input
            label="One-time password"
            type="text"
            placeholder="Enter OTP"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_MAX_LENGTH}
            disabled={busy}
            leftIcon={
              <Icon icon="mdi:shield-key-outline" width={18} height={18} />
            }
            {...register("credential")}
            error={errors.credential?.message}
          />
        )}

        <div className={styles.consentField}>
          <label className={styles.consentLabel}>
            <input
              type="checkbox"
              className={styles.consentBox}
              disabled={busy}
              {...register("acknowledged")}
            />
            <span className={styles.consentText}>
              I understand this cannot be undone
            </span>
          </label>
          {errors.acknowledged && (
            <p className={styles.consentError}>{errors.acknowledged.message}</p>
          )}
        </div>

        <div className={styles.actions}>
          <Button
            variant="danger"
            size="lg"
            fullWidth
            type="submit"
            loading={confirm.isPending}
            // The tick is the gate this whole modal exists for.
            disabled={!acknowledged || throttled || busy}
          >
            Delete my account
          </Button>

          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  )
}
