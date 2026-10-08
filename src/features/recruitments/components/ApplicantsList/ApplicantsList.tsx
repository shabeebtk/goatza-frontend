"use client"

/**
 * ApplicantsList — org-admin list of a recruitment's applicants.
 *
 * Three stage tabs — Screening, Confirmed, Result (PIPELINE_STAGES) — each a
 * fixed set of statuses that offers ONLY the bulk actions valid at that stage;
 * withdrawn applicants sit behind their own chip, read-only. A tab is a real
 * server filter (one comma-separated `status` param), so paging and counts
 * stay server-side. Debounced search + age-group chips narrow within it,
 * offset-paged with infinite scroll. Multi-select → sticky bulk bar with an
 * optional internal reason note; row click opens the ApplicantDetailDrawer
 * (single change + the history timeline live there).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
  useRecruitmentApplicants,
  useBulkUpdateApplicationStatus,
  useBulkUpdateApplicationFee,
  useUpdateApplicationStatus,
} from "../../hooks/useRecruitments"
import HighlightsChip from "@/features/highlights/components/HighlightsChip/HighlightsChip"
import HighlightPipelineViewer, {
  type PipelinePlayer,
} from "@/features/highlights/components/HighlightPipelineViewer/HighlightPipelineViewer"
import HighlightViewerActions from "@/features/highlights/components/HighlightViewerActions/HighlightViewerActions"
import viewerActionStyles from "@/features/highlights/components/HighlightViewerActions/HighlightViewerActions.module.css"
import {
  APPLICATION_STATUS_META,
  CONFIRM_FIRST,
  PIPELINE_STAGES,
  STATUS_ACTION_DESCRIPTION,
  statusActionLabel,
  statusLabel,
  statusMeta,
  type PipelineStage,
} from "../../applicationStatus"
import { formatBirthYears } from "../../eligibility"
import {
  FALLBACK_TRIAL_TIME_ZONE,
  formatTrialDay,
  isTrialDayAhead,
} from "../../trialEnded"
import type {
  ApplicationStatus,
  ApplicantListItem,
  BulkStatusTarget,
  RecruitmentAgeCategory,
  RecruitmentTypeValue,
  SelfReportedOutcome,
  SessionMode,
  StatusChangeSkip,
  TrialSession,
} from "../../services/recruitments.api"
import StatusBadge from "../StatusBadge/StatusBadge"
import ApplicantDetailDrawer from "../ApplicantDetailDrawer/ApplicantDetailDrawer"
import {
  formatSessionDate,
  isMultiPlace,
  liveSessions,
  sessionOptionLabel,
} from "../../sessionDisplay"
import { useMessageApplicants } from "../../hooks/useAnnouncements"
import { waLink } from "../../whatsapp/waLink"
import { confirmedListMessage } from "../../whatsapp/whatsappTemplates"
import styles from "./ApplicantsList.module.css"

dayjs.extend(relativeTime)

// A stage tab, or the read-only withdrawn view beside them.
type ListView = PipelineStage | "withdrawn"
// "all" = every group; an age-group id narrows to applicants who picked it.
type GroupFilter = string

const WITHDRAWN: ApplicationStatus[] = ["withdrawn"]

// What each view says when it has nothing to show (and no search/group
// filter is narrowing it).
const EMPTY_COPY: Record<ListView, { title: string; body: string }> = {
  screening: {
    title: "No applicants yet",
    body: "Applications will appear here as players apply.",
  },
  confirmed: {
    title: "No one confirmed yet",
    body: "Confirm players from Screening — they'll appear here.",
  },
  result: {
    title: "No results yet",
    body: "Mark confirmed players Selected or Not selected after the trial.",
  },
  withdrawn: {
    title: "No withdrawn applications",
    body: "Players who withdraw appear here.",
  },
}

const SKIP_LABEL: Record<StatusChangeSkip["reason"], string> = {
  withdrawn: "withdrawn",
  no_change: "already set",
  not_found: "not found",
}

function summarizeSkips(skips: StatusChangeSkip[]): string {
  return [...new Set(skips.map((s) => SKIP_LABEL[s.reason] ?? s.reason))].join(", ")
}

// ── Row skeleton (mirrors RecruitmentCardSkeleton shimmer) ─────

function ApplicantRowSkeleton() {
  return (
    <div className={styles.row} aria-hidden="true">
      <div className={styles.avatarSkeleton} />
      <div className={styles.rowMain}>
        <div className={`${styles.shimmer} ${styles.lineName}`} />
        <div className={`${styles.shimmer} ${styles.lineSub}`} />
      </div>
      <div className={`${styles.shimmer} ${styles.badgeSkeleton}`} />
    </div>
  )
}

// ── Shortlist from inside the viewer ───────────────────────────
// Reuses the pipeline's own single-status mutation, so the list behind the modal
// refreshes through the same invalidation the drawer relies on.
function ShortlistAction({
  applicationId,
  recruitmentId,
  recruitmentType,
  status,
}: {
  applicationId?: string
  recruitmentId: string
  recruitmentType?: RecruitmentTypeValue
  status?: ApplicationStatus
}) {
  const { mutate, isPending } = useUpdateApplicationStatus()
  const toast = useToast()

  if (!applicationId) return null

  // Only a fresh or in-review application can still be shortlisted; anything
  // past that (or out of the running) just shows where it stands.
  const settled = !!status && status !== "applied" && status !== "reviewing"

  if (settled) {
    const meta = statusMeta(status, recruitmentType)
    return (
      <span className={`${viewerActionStyles.action} ${viewerActionStyles.actionDone}`}>
        <Icon icon={meta.icon} width={15} height={15} />
        {meta.label}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`${viewerActionStyles.action} ${viewerActionStyles.actionPrimary}`}
      disabled={isPending}
      onClick={() =>
        mutate(
          { applicationId, recruitmentId, status: "shortlisted" },
          {
            onSuccess: () =>
              toast.show({ title: "Shortlisted", variant: "success" }),
            onError: (err) =>
              toast.show({
                title: getApiErrorMessage(err, "Couldn't shortlist."),
                variant: "error",
              }),
          }
        )
      }
    >
      {isPending ? (
        <span className={viewerActionStyles.actionSpinner} aria-hidden="true" />
      ) : (
        <Icon icon={APPLICATION_STATUS_META.shortlisted.icon} width={15} height={15} />
      )}
      Shortlist
    </button>
  )
}

// ── "Says: …" — the PLAYER'S CLAIM, never a status ────────────
//
// Deliberately a DIFFERENT SHAPE from StatusBadge next to it: a square-ish
// outlined tag with a "Says:" prefix, against the badge's filled pill. An org
// glancing down the column must never read a claim as a decision, and colour
// alone does not carry that — a colour-blind reviewer, or anyone scanning
// fast, would see two pills and trust both equally.
//
// Renders NOTHING when there is no answer. "No answer yet" on 300 rows is 300
// rows of noise, and absence already says it.

function SelfReportTag({ item }: { item: ApplicantListItem }) {
  const outcome = item.outcome_self_reported || ""
  const attended = item.attended_self_reported

  // Not answered at all.
  if (!item.feedback_at && attended == null && !outcome) return null

  if (attended === false) {
    return (
      <span className={`${styles.saysTag} ${styles.saysMuted}`} title="The player said they couldn't make it">
        Didn&apos;t attend
      </span>
    )
  }

  const tone =
    outcome === "selected"
      ? styles.saysPositive
      : outcome === "waiting"
        ? styles.saysWaiting
        : styles.saysNeutral

  const label =
    outcome === "selected"
      ? "selected"
      : outcome === "not_selected"
        ? "not selected"
        : outcome === "waiting"
          ? "waiting"
          : null

  // Attended, but no outcome on the row (an older payload, or a shape the
  // server has since stopped producing). Say the true, smaller thing.
  if (!label) {
    return (
      <span className={`${styles.saysTag} ${styles.saysNeutral}`} title="The player said they attended">
        Says: attended
      </span>
    )
  }

  return (
    <span className={`${styles.saysTag} ${tone}`} title="What the player said — not a status">
      Says: {label}
    </span>
  )
}

// ── Applicant row ──────────────────────────────────────────────

function ApplicantRow({
  item,
  recruitmentType,
  selectable,
  selected,
  showFee,
  showSession,
  onToggle,
  onOpen,
  onOpenHighlights,
  timeZone,
}: {
  item: ApplicantListItem
  recruitmentType?: RecruitmentTypeValue
  /** The trial's own zone — the calendar the chosen date is named on. */
  timeZone: string
  selectable: boolean
  selected: boolean
  /** Only a trial that HAS a fee shows a fee chip. */
  showFee: boolean
  /** Only a choose_one trial has a date to show. */
  showSession: boolean
  onToggle: () => void
  onOpen: () => void
  onOpenHighlights: () => void
}) {
  const { applicant } = item
  const hasHighlights = (item.highlights_count ?? 0) > 0
  return (
    <div className={`${styles.rowCard} ${selectable ? styles.rowCardSelectable : ""} ${selected ? styles.rowCardSelected : ""} ${hasHighlights ? styles.rowCardWithChip : ""}`}>
      {/* Round selector overlaid at the card's top-left (photo-gallery style).
          Withdrawn rows get no circle. stopPropagation so it never opens the drawer. */}
      {selectable && (
        <button
          className={styles.selectCircle}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          type="button"
          aria-pressed={selected}
          aria-label={selected
            ? `Deselect ${item.shared_name || applicant.name}`
            : `Select ${item.shared_name || applicant.name}`}
        >
          <span className={`${styles.selectDot} ${selected ? styles.selectDotOn : ""}`}>
            {selected && <Icon icon="mdi:check" width={12} height={12} />}
          </span>
        </button>
      )}

      <button className={styles.row} onClick={onOpen} type="button">
        <Avatar
          src={applicant.avatar}
          initials={(item.shared_name || applicant.name)?.slice(0, 2).toUpperCase()}
          size="md"
        />
        <div className={styles.rowMain}>
          <div className={styles.rowTop}>
            <span className={styles.name}>{item.shared_name || applicant.name}</span>
            {applicant.username && <span className={styles.username}>@{applicant.username}</span>}
            {/* A flag to check at the desk, not an accusation — amber, and it
                never blocks a thing. Frozen at apply time; the drawer shows
                whether the profile has changed since. */}
            {item.age_mismatch_at_apply && (
              <span
                className={styles.ageMismatch}
                title="Their profile birth year was outside this group when they applied"
              >
                <Icon icon="mdi:alert-outline" width={12} height={12} />
                Age mismatch
              </span>
            )}
          </div>
          {applicant.headline && <span className={styles.headline}>{applicant.headline}</span>}
          <span className={styles.appliedAt}>
            <Icon icon="mdi:clock-outline" width={12} height={12} />
            Applied {dayjs(item.applied_at).fromNow()}
          </span>
          {/* The group they applied under. "—" rather than nothing, so a row
              with no group reads as answered, not as missing data. */}
          <span className={styles.groupTag}>
            <Icon icon="mdi:account-group-outline" width={12} height={12} />
            {item.age_category?.title ?? "—"}
          </span>
          {/* Which city they said they were coming to. */}
          {showSession && (
            <span className={styles.groupTag}>
              <Icon icon="mdi:calendar-check" width={12} height={12} />
              {item.session
                ? sessionOptionLabel(item.session, { timezone: timeZone })
                : "—"}
            </span>
          )}
          {/* The fee as the gate recorded it. INFORMATION: it gates
              nothing, here or on the server. */}
          {showFee && (
            <span
              className={`${styles.feeTag} ${item.fee_paid ? styles.feeTagPaid : ""}`}
              title={
                item.fee_paid
                  ? `Marked paid${item.fee_marked_by ? ` by ${item.fee_marked_by.name}` : ""}`
                  : "Fee not marked"
              }
            >
              <Icon icon={item.fee_paid ? "mdi:cash-check" : "mdi:cash-remove"} width={12} height={12} />
              {item.fee_paid ? "Fee paid" : "Fee due"}
            </span>
          )}
          {/* What the player said about the trial. Renders itself or nothing. */}
          <SelfReportTag item={item} />
        </div>
        <div className={styles.rowRight}>
          <StatusBadge status={item.status} recruitmentType={recruitmentType} />
          <Icon icon="mdi:chevron-right" width={18} height={18} className={styles.rowChevron} />
        </div>
      </button>

      {/* Overlaid, and OUTSIDE the row button on purpose — a button inside a
          button is invalid HTML and steals the row's keyboard semantics. The
          count ships with the row, so this costs no request and no reflow (the
          row reserves its space via .rowCardWithChip). */}
      {hasHighlights && (
        <div className={styles.rowChip}>
          <HighlightsChip
            username={applicant.username}
            count={item.highlights_count}
            onOpen={onOpenHighlights}
          />
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────

export default function ApplicantsList({
  recruitmentId,
  ageCategories = [],
  sessions = [],
  recruitmentType,
  eventDate = null,
  hasFee = false,
  sessionMode,
  recruitmentTitle,
  orgName,
  timezone = FALLBACK_TRIAL_TIME_ZONE,
}: {
  recruitmentId: string
  /** The recruitment's own age groups — empty when it is open to all ages. */
  ageCategories?: RecruitmentAgeCategory[]
  /**
   * The trial's dates, read for the CENTRE filter alone. Allowed to be
   * empty: one date is nothing to filter by, and a payload without sessions
   * simply shows no chip row.
   */
  sessions?: TrialSession[]
  /** Picks per-type wording, and whether the Result tab waits for a trial day. */
  recruitmentType?: RecruitmentTypeValue
  /** The trial day; with an open trial, results open on it. */
  eventDate?: string | null
  /** Whether the trial charges one. No fee, no fee column and no filter. */
  hasFee?: boolean
  /** choose_one is the only mode where an applicant has a date of their own. */
  sessionMode?: SessionMode
  /** For the Confirmed tab's copyable list. */
  recruitmentTitle?: string
  orgName?: string
  /**
   * The trial's OWN zone. Every date on this screen is named in it — the
   * results gate included, which opens on the trial day at the ground and
   * not on the organiser's own clock.
   */
  timezone?: string
}) {
  const toast = useToast()
  const noteId = useId()
  const [view, setView] = useState<ListView>("screening")
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all")
  // WHICH CENTRE, on a trial that visits several. "all" is the absence of a
  // filter, not a value the server knows — the same contract groupFilter has.
  const [centreFilter, setCentreFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)
  // Which player's reel the viewer starts on; null = viewer closed.
  const [reelStart, setReelStart] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // THE FEE, and the OTHER age question. The group chips above say which
  // group somebody applied UNDER; these two say how old they actually ARE
  // and whether they have paid. Deliberately a separate row so the org
  // never reads one as the other.
  const [feeFilter, setFeeFilter] = useState<"all" | "paid" | "unpaid">("all")
  const [birthYearMin, setBirthYearMin] = useState("")
  const [birthYearMax, setBirthYearMax] = useState("")
  const [mismatchOnly, setMismatchOnly] = useState(false)
  const [sort, setSort] = useState<"" | "birth_year" | "-birth_year">("")
  // WHAT THE PLAYER SAID. A different question from the stage tabs above,
  // which are what the ORG decided. "" is no filter, not a value.
  const [selfOutcome, setSelfOutcome] = useState<
    "" | SelfReportedOutcome | "attended" | "not_attended"
  >("")

  // Junk is simply not a filter — the same leniency the server applies, so
  // a half-typed year never empties the list.
  const asYear = (value: string) => {
    const year = Number(value)
    return value.trim() && Number.isInteger(year) && year >= 1900 && year <= 2100
      ? year
      : undefined
  }
  const minYear = asYear(birthYearMin)
  const maxYear = asYear(birthYearMax)
  const rangeActive = minYear !== undefined || maxYear !== undefined

  const showFeeColumn = hasFee
  const showSessionColumn = sessionMode === "choose_one"

  // THE WORKFLOW THIS EXISTS FOR: on the Result tab, narrow to "says
  // selected", select all, mark Selected. Only that tab — before the trial
  // nobody has said anything, and on Screening the question is not yet asked.
  const showSelfOutcomeFilter = view === "result"

  // Marking a fee is not a pipeline move, so it is available on the two tabs
  // where the gate actually stands: people being screened, and people who are
  // coming. The Confirmed tab has no STATUS actions at all, so this is also
  // what gives that tab its checkboxes.
  const feeBulkAvailable =
    showFeeColumn && (view === "screening" || view === "confirmed")

  // Messaging is available in EVERY tab: the people worth a private word
  // are as often the ones who did not make it as the ones who did.
  const messageBulkAvailable = view !== "withdrawn"
  // A "not this time" action waiting on its confirm step.
  const [confirmTarget, setConfirmTarget] = useState<BulkStatusTarget | null>(null)
  // The internal reason — optional on purpose: a forced one gets "." and "..".
  const [note, setNote] = useState("")

  const { mutate: bulkUpdate, isPending: bulkPending } = useBulkUpdateApplicationStatus()
  const { mutate: bulkFee, isPending: feePending } = useBulkUpdateApplicationFee()
  const { mutate: messageSelected, isPending: messagePending } =
    useMessageApplicants(recruitmentId)

  // The message composer. Open on demand from the bulk bar; it returns
  // immediately and the cron delivers, so the copy never claims "sent".
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageBody, setMessageBody] = useState("")

  const stage = PIPELINE_STAGES.find((s) => s.key === view)
  const viewStatuses = stage ? stage.statuses : WITHDRAWN
  const viewActions = stage?.actions ?? []

  // Results open ON the trial day, on THE VENUE's calendar — the server
  // refuses them before that too, with the same date and the same zone. Only
  // an open trial has one; a looking-for-players post's Result tab is always
  // live.
  const resultsLocked =
    view === "result" &&
    recruitmentType === "open_trial" &&
    // `undefined` for `now`, not Date.now(): reading the clock in a render
    // body is an impure call, and the default inside the function is the
    // same value taken in the right place.
    isTrialDayAhead(eventDate, undefined, timezone)

  /**
   * THE CENTRES, for the chip row.
   *
   * Every live date, in the order the posting lists them — deliberately NOT
   * `upcomingSessions`: an org works through yesterday's applicants for days
   * afterwards, and a chip that disappeared at midnight would hide them.
   *
   * Labelled by PLACE where the places differ and by DATE where they do not.
   * `isMultiPlace` is that test: two rounds at one ground would otherwise
   * give two chips both reading "Corporation Stadium", which chooses
   * nothing, while four cities is exactly what the person holding the list
   * is standing in.
   */
  const centres = useMemo(() => liveSessions(sessions), [sessions])
  const centresDiffer = useMemo(() => isMultiPlace({ sessions }), [sessions])
  const centreLabel = useCallback(
    (session: TrialSession) =>
      (centresDiffer
        ? session.city?.trim() || session.venue_name?.trim()
        : "") || formatSessionDate(session.date, timezone),
    [centresDiffer, timezone]
  )

  // Debounce search (mirrors ConversationsList).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // A selection only makes sense within one tab/filter/search view. Reset it
  // the moment that view changes — render-phase reset (React's recommended
  // alternative to a setState-in-effect), so it happens before paint.
  // selfOutcome is in here: narrowing the list changes WHICH rows are on
  // screen, and a selection carried across that would mark people the org can
  // no longer see.
  const viewKey =
    `${view}|${groupFilter}|${centreFilter}|${debouncedSearch}|${selfOutcome}`
  const [selectionViewKey, setSelectionViewKey] = useState(viewKey)
  if (selectionViewKey !== viewKey) {
    setSelectionViewKey(viewKey)
    setSelected(new Set())
    setConfirmTarget(null)
  }

  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecruitmentApplicants(recruitmentId, {
    status: viewStatuses,
    search: debouncedSearch || undefined,
    age_category: groupFilter === "all" ? undefined : groupFilter,
    session: centreFilter === "all" ? undefined : centreFilter,
    fee_paid:
      !showFeeColumn || feeFilter === "all"
        ? undefined
        : feeFilter === "paid",
    birth_year_min: minYear,
    birth_year_max: maxYear,
    age_mismatch: mismatchOnly || undefined,
    self_outcome: showSelfOutcomeFilter ? selfOutcome || undefined : undefined,
    sort: sort || undefined,
  })

  // ── Infinite scroll ──────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "600px", threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data],
  )

  /**
   * The reel queue, in list order: only applicants the viewer can actually watch
   * (count > 0), so the viewer never has to skip a player mid-review. `status`
   * rides along so the in-viewer Shortlist button knows what it's looking at.
   */
  const reelPlayers = useMemo<(PipelinePlayer & { status: ApplicationStatus })[]>(
    () =>
      items
        .filter((item) => (item.highlights_count ?? 0) > 0)
        .map((item) => ({
          username: item.applicant.username,
          name: item.shared_name || item.applicant.name,
          headline: item.applicant.headline,
          avatar: item.applicant.avatar,
          applicationId: item.id,
          status: item.status,
        })),
    [items]
  )

  /** Where a given applicant sits in that queue (-1 when they have no clips). */
  const reelIndexOf = useCallback(
    (applicationId: string) =>
      reelPlayers.findIndex((p) => p.applicationId === applicationId),
    [reelPlayers]
  )

  // Tab counts come off the status_counts every page already carries (zeros
  // included), summed per stage — no extra request. Unfiltered by search or
  // group, like the old chips.
  const statusCounts = data?.pages[0]?.status_counts
  const countOf = useCallback(
    (statuses: ApplicationStatus[]) =>
      statusCounts ? statuses.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0) : null,
    [statusCounts]
  )
  const withdrawnCount = countOf(WITHDRAWN) ?? 0

  const filtersActive =
    groupFilter !== "all"
    || centreFilter !== "all"
    || debouncedSearch.length > 0
    || feeFilter !== "all"
    || rangeActive
    || mismatchOnly

  // How many applicants the range is hiding because they have no birth
  // year on file. The server only counts it while a range is active.
  const noBirthYearCount = data?.pages[0]?.no_birth_year_count ?? 0

  // ── Selection ────────────────────────────────────────────────
  // A view with no valid actions (Confirmed, for now; Withdrawn, always)
  // offers no checkboxes — a bulk bar with nothing on it is a dead end.
  const selectableIds = useMemo(
    () =>
      (viewActions.length === 0 && !feeBulkAvailable && !messageBulkAvailable)
      || resultsLocked
        ? []
        : items.filter((i) => i.status !== "withdrawn").map((i) => i.id),
    [
      items, viewActions.length, feeBulkAvailable, messageBulkAvailable,
      resultsLocked,
    ]
  )
  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds])
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allOn = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id))
      return allOn ? new Set() : new Set(selectableIds)
    })
  }, [selectableIds])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setConfirmTarget(null)
  }, [])

  const runBulkFee = (feePaid: boolean) => {
    const applicationIds = [...selected]
    if (applicationIds.length === 0) return
    bulkFee(
      { recruitmentId, applicationIds, feePaid },
      {
        onSuccess: (result) => {
          const n = result.updated.length
          const skipped = result.skipped.length
          toast.show({
            title: `${n} applicant${n === 1 ? "" : "s"} marked ${feePaid ? "paid" : "unpaid"}`,
            message:
              skipped > 0
                ? `${skipped} skipped (${summarizeSkips(result.skipped)})`
                : undefined,
            variant: "success",
          })
          clearSelection()
        },
        onError: (err) => {
          toast.show({
            title: getApiErrorMessage(err, "Couldn't update the fee."),
            variant: "error",
          })
        },
      },
    )
  }

  const runMessage = () => {
    const applicationIds = [...selected]
    const body = messageBody.trim()
    if (applicationIds.length === 0 || !body) return

    messageSelected(
      { applicationIds, body },
      {
        onSuccess: (result) => {
          const skipped = result.skipped.length
          toast.show({
            // "queued", not "sent": the outbox drains on a cron and
            // nothing has been delivered at this instant.
            title: `Message queued for ${result.queued} player(s)`,
            message:
              skipped > 0
                ? `${skipped} skipped (${summarizeSkips(result.skipped)})`
                : "Each player gets it privately within a few minutes.",
            variant: "success",
          })
          setMessageOpen(false)
          setMessageBody("")
          clearSelection()
        },
        onError: (err) => {
          // Shares the 5-per-day guard with announcements, and that 400
          // says when they can send again. Show it verbatim.
          toast.show({
            title: getApiErrorMessage(err, "Couldn't send the message."),
            variant: "error",
          })
        },
      },
    )
  }

  const runBulk = (target: BulkStatusTarget) => {
    const applicationIds = [...selected]
    if (applicationIds.length === 0) return
    bulkUpdate(
      {
        recruitmentId,
        applicationIds,
        status: target,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          const n = result.updated.length
          const skipped = result.skipped.length
          toast.show({
            title: `${n} applicant${n === 1 ? "" : "s"} moved to ${statusLabel(target, recruitmentType)}`,
            message:
              skipped > 0
                ? `${skipped} skipped (${summarizeSkips(result.skipped)})`
                : undefined,
            variant: "success",
          })
          clearSelection()
          setNote("")
        },
        onError: (err) => {
          // The recruitment-level guards ("Results open on …", "This trial has
          // ended …") are written for the org — show the server's words as-is.
          toast.show({
            title: getApiErrorMessage(err, "Couldn't update applicants."),
            variant: "error",
          })
        },
      }
    )
  }

  const emptyCopy = EMPTY_COPY[view]

  return (
    <div className={styles.wrapper}>
      {/* Search */}
      <div className={styles.searchWrap}>
        <Icon icon="mdi:magnify" width={18} height={18} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or @username"
          type="search"
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch("")} type="button" aria-label="Clear search">
            <Icon icon="mdi:close" width={15} height={15} />
          </button>
        )}
      </div>

      {/* Stage tabs + the withdrawn view beside them */}
      <div className={styles.tabRow}>
        <div className={styles.tabs} role="tablist" aria-label="Pipeline stage">
          {PIPELINE_STAGES.map((s) => {
            const count = countOf(s.statuses)
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={view === s.key}
                className={`${styles.tab} ${view === s.key ? styles.tabActive : ""}`}
                onClick={() => setView(s.key)}
                type="button"
              >
                {s.label}
                {count !== null && <span className={styles.tabCount}>{count}</span>}
              </button>
            )
          })}
        </div>
        {(withdrawnCount > 0 || view === "withdrawn") && (
          <button
            className={`${styles.chip} ${view === "withdrawn" ? styles.chipActive : ""}`}
            onClick={() => setView(view === "withdrawn" ? "screening" : "withdrawn")}
            type="button"
            aria-pressed={view === "withdrawn"}
          >
            Withdrawn
            <span className={styles.chipCount}>{withdrawnCount}</span>
          </button>
        )}
      </div>

      {/* Age-group chips — only for a recruitment that published groups.
          The backend ignores an id it doesn't own, so a stale group can never
          empty the list wrongly. */}
      {ageCategories.length > 0 && (
        <div className={styles.chipRow}>
          <button
            className={`${styles.chip} ${groupFilter === "all" ? styles.chipActive : ""}`}
            onClick={() => setGroupFilter("all")}
            type="button"
          >
            All groups
          </button>
          {ageCategories.map((group) => (
            <button
              key={group.id}
              className={`${styles.chip} ${groupFilter === group.id ? styles.chipActive : ""}`}
              onClick={() => setGroupFilter(group.id)}
              type="button"
              title={formatBirthYears(group.min_birth_year, group.max_birth_year)}
            >
              {group.title}
            </button>
          ))}
        </div>
      )}

      {/* CENTRE chips — THE GATE LIST. The staff standing at the Kozhikode
          ground want the Kozhikode players; the other three cities are
          somebody else's morning, and scrolling past them at a gate with a
          queue in front of you is the whole problem.

          Only where there is more than one date to choose between, and the
          backend ignores a session id it doesn't own, so a stale chip can
          never wrongly empty the list. */}
      {centres.length > 1 && (
        <div className={styles.chipRow}>
          <button
            className={`${styles.chip} ${centreFilter === "all" ? styles.chipActive : ""}`}
            onClick={() => setCentreFilter("all")}
            type="button"
          >
            All centres
          </button>
          {centres.map((session) => (
            <button
              key={session.id}
              className={`${styles.chip} ${centreFilter === session.id ? styles.chipActive : ""}`}
              onClick={() => setCentreFilter(session.id)}
              type="button"
              title={formatSessionDate(session.date, timezone)}
            >
              {centreLabel(session)}
            </button>
          ))}
        </div>
      )}


      {/* The night-before list for the org's own staff group. NO PHONE
          NUMBERS in it: this text lands in a group chat, and a column of
          applicants' numbers pasted into one is a leak with the org's
          name on it. */}
      {view === "confirmed" && items.length > 0 && (
        <div className={styles.copyRow}>
          <button
            className={styles.chip}
            type="button"
            onClick={() => {
              const text = confirmedListMessage({
                recruitmentTitle: recruitmentTitle ?? "Trial",
                orgName: orgName ?? "",
                players: items.map((item) => ({
                  name: item.shared_name || item.applicant.name,
                  ageGroup: item.age_category?.title,
                  reportingTime: item.age_category?.reporting_time,
                })),
              })
              navigator.clipboard?.writeText(text).then(
                () => toast.show({ title: "List copied", variant: "success" }),
                () => toast.show({ title: "Couldn't copy", variant: "error" }),
              )
            }}
          >
            <Icon icon="mdi:content-copy" width={13} height={13} />
            Copy list
          </button>
          <a
            className={styles.chip}
            href={waLink(null, confirmedListMessage({
              recruitmentTitle: recruitmentTitle ?? "Trial",
              orgName: orgName ?? "",
              players: items.map((item) => ({
                name: item.shared_name || item.applicant.name,
                ageGroup: item.age_category?.title,
                reportingTime: item.age_category?.reporting_time,
              })),
            }))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon icon="mdi:whatsapp" width={13} height={13} />
            Share list
          </a>
        </div>
      )}

      {/* THE OTHER AGE QUESTION. The chips above are the group somebody
          applied UNDER; this is how old they actually ARE. Birth years, never
          ages — the groups are modelled in birth years and mixing the two
          produces an off-by-one every January. */}
      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Birth year</span>
        <input
          className={styles.yearInput}
          type="number"
          inputMode="numeric"
          placeholder="min"
          value={birthYearMin}
          onChange={(e) => setBirthYearMin(e.target.value)}
          aria-label="Minimum birth year"
        />
        <span className={styles.filterDash}>–</span>
        <input
          className={styles.yearInput}
          type="number"
          inputMode="numeric"
          placeholder="max"
          value={birthYearMax}
          onChange={(e) => setBirthYearMax(e.target.value)}
          aria-label="Maximum birth year"
        />

        <label className={styles.filterCheck}>
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => setMismatchOnly(e.target.checked)}
          />
          Age mismatch only
        </label>

        <button
          className={`${styles.chip} ${sort ? styles.chipActive : ""}`}
          type="button"
          onClick={() =>
            setSort((prev) =>
              prev === "" ? "birth_year" : prev === "birth_year" ? "-birth_year" : ""
            )
          }
          aria-pressed={!!sort}
          title="Sort by birth year — applicants with none sort last either way"
        >
          <Icon
            icon={
              sort === "birth_year"
                ? "mdi:sort-calendar-ascending"
                : sort === "-birth_year"
                  ? "mdi:sort-calendar-descending"
                  : "mdi:sort-variant"
            }
            width={13}
            height={13}
          />
          {sort === "birth_year"
            ? "Oldest first"
            : sort === "-birth_year"
              ? "Youngest first"
              : "Newest first"}
        </button>

        {/* Only a trial that charges one has a fee to filter by. */}
        {showFeeColumn && (
          <div className={styles.feeFilter} role="group" aria-label="Fee">
            {([
              { value: "all" as const, label: "All" },
              { value: "paid" as const, label: "Fee paid" },
              { value: "unpaid" as const, label: "Fee due" },
            ]).map((option) => (
              <button
                key={option.value}
                className={`${styles.chip} ${feeFilter === option.value ? styles.chipActive : ""}`}
                onClick={() => setFeeFilter(option.value)}
                type="button"
                aria-pressed={feeFilter === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Without this line a range filter silently loses people and the org
          never finds out. */}
      {rangeActive && noBirthYearCount > 0 && (
        <p className={styles.hiddenNote} role="status">
          <Icon icon="mdi:information-outline" width={13} height={13} />
          {noBirthYearCount} applicant{noBirthYearCount === 1 ? " has" : "s have"} no
          birth year set and aren&apos;t shown.
        </p>
      )}

      {/* WHAT THE PLAYER SAID — the filter the whole self-report feature is
          for. Placed DIRECTLY above the select-all row on purpose: "says
          selected → select all → Mark Selected" is the path, and putting
          anything between these two is what makes an org scroll and give up. */}
      {showSelfOutcomeFilter && (
        <div className={styles.chipRow} role="group" aria-label="What the player said">
          {([
            { value: "" as const, label: "All" },
            { value: "selected" as const, label: "Says selected" },
            { value: "not_selected" as const, label: "Says not selected" },
            { value: "waiting" as const, label: "Waiting" },
            { value: "not_attended" as const, label: "Didn't attend" },
          ]).map((option) => (
            <button
              key={option.value || "all"}
              className={`${styles.chip} ${selfOutcome === option.value ? styles.chipActive : ""}`}
              onClick={() => setSelfOutcome(option.value)}
              type="button"
              aria-pressed={selfOutcome === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Select-all header (only when there are selectable rows) */}
      {!isLoading && !isError && selectableIds.length > 0 && (
        <div className={styles.selectAllRow}>
          <button
            className={`${styles.selectAllBtn} ${allSelected ? styles.selectAllBtnActive : ""}`}
            onClick={toggleAll}
            type="button"
            aria-pressed={allSelected}
          >
            <Icon
              icon={allSelected ? "mdi:check-circle" : "mdi:checkbox-blank-circle-outline"}
              width={16}
              height={16}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </button>
        </div>
      )}

      {/* States */}
      {resultsLocked && eventDate ? (
        // Before the trial there is nothing to decide, so no rows — the tab
        // says when it opens instead of letting the org try and be refused.
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Icon icon="mdi:calendar-clock" width={40} height={40} />
          </div>
          <p className={styles.emptyTitle}>
            Results open on {formatTrialDay(eventDate, timezone)}
          </p>
          <p className={styles.emptyBody}>If that date is wrong, edit the trial.</p>
        </div>
      ) : isLoading ? (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => <ApplicantRowSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className={styles.errorState}>
          <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
          <p>Failed to load applicants.</p>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Icon icon="mdi:account-multiple-outline" width={40} height={40} />
          </div>
          <p className={styles.emptyTitle}>
            {filtersActive ? "No matching applicants" : emptyCopy.title}
          </p>
          <p className={styles.emptyBody}>
            {filtersActive ? "Try a different group or search term." : emptyCopy.body}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {items.map((item) => (
              <ApplicantRow
                key={item.id}
                item={item}
                timeZone={timezone}
                recruitmentType={recruitmentType}
                selectable={selectableSet.has(item.id)}
                selected={selected.has(item.id)}
                showFee={showFeeColumn}
                showSession={showSessionColumn}
                onToggle={() => toggleOne(item.id)}
                onOpen={() => setOpenApplicationId(item.id)}
                onOpenHighlights={() => {
                  const index = reelIndexOf(item.id)
                  if (index >= 0) setReelStart(index)
                }}
              />
            ))}
          </div>

          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          {isFetchingNextPage && (
            <div className={styles.loadingMore}>
              <span className={styles.loadingSpinner} aria-hidden="true" />
              <span className={styles.loadingText}>Loading more…</span>
            </div>
          )}
          {!hasNextPage && items.length > 0 && (
            <div className={styles.endOfList}>
              <span className={styles.endDot} />
              <span>All applicants loaded</span>
              <span className={styles.endDot} />
            </div>
          )}
        </>
      )}

      {/* MESSAGE SELECTED. Returns immediately and drains on the cron, like
          an announcement — so this says "queued", never "sent". */}
      {messageOpen && (
        <div className={styles.messageBackdrop} role="dialog" aria-modal="true" aria-label="Message selected players">
          <div className={styles.messageSheet}>
            <h3 className={styles.messageHeading}>
              Message {selected.size} player{selected.size === 1 ? "" : "s"}
            </h3>
            {/* The one thing the org must understand before writing a word. */}
            <p className={styles.messageNote}>
              Each player gets this as a private message. They won&apos;t see
              each other.
            </p>

            <textarea
              className={styles.messageInput}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value.slice(0, 1000))}
              placeholder="Come at 7 instead of 8 — we've moved the U15 slot forward."
              rows={5}
              maxLength={1000}
              disabled={messagePending}
              autoFocus
            />
            <span className={styles.messageCount}>{messageBody.length}/1000</span>

            <div className={styles.messageActions}>
              <button
                className={styles.bulkGhost}
                onClick={() => setMessageOpen(false)}
                type="button"
                disabled={messagePending}
              >
                Cancel
              </button>
              <button
                className={styles.bulkBtn}
                onClick={runMessage}
                type="button"
                disabled={messagePending || !messageBody.trim()}
              >
                {messagePending
                  ? "Sending…"
                  : `Send to ${selected.size} player${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bulk action bar — only this stage's actions. */}
      {selected.size > 0
        && (viewActions.length > 0 || feeBulkAvailable || messageBulkAvailable) && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>{selected.size} selected</span>
            <button className={styles.bulkClear} onClick={clearSelection} type="button" disabled={bulkPending}>
              Clear
            </button>
          </div>

          {/* Prominent, never required. Internal in v1: no player surface
              renders it. Only for STATUS moves — a fee mark has no reason. */}
          {viewActions.length > 0 && (
          <div className={styles.bulkNote}>
            <label className={styles.bulkNoteLabel} htmlFor={noteId}>
              Reason (internal)
            </label>
            <input
              id={noteId}
              className={styles.bulkNoteInput}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. strong in the 1v1s"
              maxLength={1000}
              disabled={bulkPending}
            />
            <p className={styles.bulkNoteHelp}>
              Only your organization sees this. The player never does.
            </p>
          </div>
          )}

          {confirmTarget ? (
            <div className={styles.bulkConfirm}>
              <span className={styles.bulkConfirmText}>
                Mark {selected.size} applicant{selected.size === 1 ? "" : "s"}{" "}
                &ldquo;{statusLabel(confirmTarget, recruitmentType)}&rdquo;?{" "}
                {STATUS_ACTION_DESCRIPTION[confirmTarget]}
              </span>
              <div className={styles.bulkConfirmActions}>
                <button
                  className={styles.bulkGhost}
                  onClick={() => setConfirmTarget(null)}
                  type="button"
                  disabled={bulkPending}
                >
                  Cancel
                </button>
                <button
                  className={styles.bulkDanger}
                  onClick={() => runBulk(confirmTarget)}
                  type="button"
                  disabled={bulkPending}
                >
                  {bulkPending
                    ? <span className={styles.bulkSpinner} aria-hidden="true" />
                    : <Icon icon={APPLICATION_STATUS_META[confirmTarget].icon} width={15} height={15} />}
                  {statusActionLabel(confirmTarget, recruitmentType)}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.bulkActions}>
              {/* The fee, alongside the stage actions but NEVER one of
                  them: marking a fee moves nobody through the pipeline,
                  and no status change reads it. */}
              {messageBulkAvailable && (
                <button
                  className={styles.bulkBtn}
                  onClick={() => setMessageOpen(true)}
                  type="button"
                  disabled={bulkPending || feePending || messagePending}
                  title="Send each of these players a private message"
                >
                  <Icon icon="mdi:message-text-outline" width={15} height={15} />
                  Message
                </button>
              )}

              {feeBulkAvailable && (
                <>
                  <button
                    className={styles.bulkBtn}
                    onClick={() => runBulkFee(true)}
                    type="button"
                    disabled={bulkPending || feePending}
                    title="Record that these applicants paid the trial fee"
                  >
                    <Icon icon="mdi:cash-check" width={15} height={15} />
                    Mark fee paid
                  </button>
                  <button
                    className={styles.bulkBtn}
                    onClick={() => runBulkFee(false)}
                    type="button"
                    disabled={bulkPending || feePending}
                    title="Clear the fee mark on these applicants"
                  >
                    <Icon icon="mdi:cash-remove" width={15} height={15} />
                    Mark unpaid
                  </button>
                </>
              )}
              {viewActions.map((target) => {
                const confirmFirst = CONFIRM_FIRST.includes(target)
                return (
                  <button
                    key={target}
                    className={`${styles.bulkBtn} ${confirmFirst ? styles.bulkBtnDanger : ""}`}
                    onClick={() => (confirmFirst ? setConfirmTarget(target) : runBulk(target))}
                    type="button"
                    disabled={bulkPending}
                    title={STATUS_ACTION_DESCRIPTION[target]}
                  >
                    {bulkPending
                      ? <span className={styles.bulkSpinner} aria-hidden="true" />
                      : <Icon icon={APPLICATION_STATUS_META[target].icon} width={15} height={15} />}
                    {statusActionLabel(target, recruitmentType)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {openApplicationId && (
        <ApplicantDetailDrawer
          applicationId={openApplicationId}
          recruitmentId={recruitmentId}
          recruitmentType={recruitmentType}
          ageCategories={ageCategories}
          recruitmentTitle={recruitmentTitle}
          orgName={orgName}
          onClose={() => setOpenApplicationId(null)}
        />
      )}

      {/* Reel review over the pipeline — the recruiter never leaves this list.
          Stage changes made in here invalidate the applicants query, so the list
          underneath is already correct when the modal closes. */}
      {reelStart !== null && reelPlayers.length > 0 && (
        <HighlightPipelineViewer
          players={reelPlayers}
          startIndex={reelStart}
          onClose={() => setReelStart(null)}
          renderActions={(player) => (
            <HighlightViewerActions username={player.username}>
              <ShortlistAction
                applicationId={player.applicationId}
                recruitmentId={recruitmentId}
                recruitmentType={recruitmentType}
                status={
                  reelPlayers.find(
                    (p) => p.applicationId === player.applicationId
                  )?.status
                }
              />
            </HighlightViewerActions>
          )}
        />
      )}
    </div>
  )
}
