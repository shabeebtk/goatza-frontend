"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

import { Card } from "@/shared/components/ui"
import { useNavigation } from "@/shared/services/navigation.service"
import type { OrganizationActor } from "@/store/auth.store"
import CreateRecruitmentTrigger from "@/features/recruitments/components/CreateRecruitmentModal/CreateRecruitmentTrigger"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"

import { useDashboard } from "../../hooks/useDashboardQueries"
import type {
  DashboardData,
  DashboardRange,
  NeedsAttention,
  PipelineCounts,
  RecruitmentRow,
  TopPost,
  UpcomingEvent,
} from "../../services/dashboard.api"
import TrendChart from "../TrendChart/TrendChart"
import styles from "./DashboardView.module.css"

dayjs.extend(relativeTime)

const RANGES: DashboardRange[] = [7, 30, 90]

// Funnel stages, in pipeline order. Colours mirror the recruitments StatusBadge.
const FUNNEL = [
  { key: "applied", label: "Applied", color: "#2563eb" },
  { key: "reviewing", label: "Reviewing", color: "#0891b2" },
  { key: "shortlisted", label: "Shortlisted", color: "#7c3aed" },
  { key: "invited", label: "Invited", color: "#b45309" },
  { key: "selected", label: "Selected", color: "var(--color-success)" },
] as const

const REC_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: styles.stActive },
  draft: { label: "Draft", cls: styles.stDraft },
  closed: { label: "Closed", cls: styles.stClosed },
  cancelled: { label: "Cancelled", cls: styles.stCancelled },
}

// ── helpers ──
const fmt = (n: number) => n.toLocaleString()

const prettyType = (type: string) =>
  type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")

// ── main ──
export default function DashboardView({
  organization,
}: {
  organization: OrganizationActor
}) {
  const [range, setRange] = useState<DashboardRange>(30)
  const [postModalOpen, setPostModalOpen] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useDashboard(
    organization.id,
    range
  )

  const hasRecruitments = (data?.recruitments_table.length ?? 0) > 0

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>{organization.name}</p>
        </div>

        <div className={styles.headerControls}>
          <div
            className={styles.rangeToggle}
            role="tablist"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ""}`}
                onClick={() => setRange(r)}
              >
                {r}d
              </button>
            ))}
          </div>

          <div className={styles.actions}>
            <CreateRecruitmentTrigger onCreated={() => refetch()}>
              {(open) => (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={open}
                >
                  <Icon icon="mdi:plus" width={16} height={16} />
                  <span>Recruitment</span>
                </button>
              )}
            </CreateRecruitmentTrigger>

            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => setPostModalOpen(true)}
            >
              <Icon icon="mdi:image-plus-outline" width={16} height={16} />
              <span>Post</span>
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div
          className={styles.body}
          data-fetching={isFetching ? "true" : undefined}
        >
          <StatCards data={data} />

          {hasRecruitments ? (
            <>
              <div className={styles.twoCol}>
                <PipelineCard pipeline={data.pipeline} />
                <NeedsAttentionCard
                  needs={data.needs_attention}
                  orgUsername={organization.username}
                />
              </div>

              <RecruitmentsTable rows={data.recruitments_table} />

              <div className={styles.twoCol}>
                <Card className={styles.chartCard}>
                  <TrendChart
                    title="Applications"
                    icon="mdi:file-account-outline"
                    accent="var(--color-brand)"
                    points={data.trends.applications_per_day}
                  />
                </Card>
                <Card className={styles.chartCard}>
                  <TrendChart
                    title="Follower growth"
                    icon="mdi:account-multiple-plus-outline"
                    accent="#7c3aed"
                    points={data.trends.followers_per_day}
                  />
                </Card>
              </div>

              <div className={styles.twoCol}>
                <UpcomingEventsCard events={data.upcoming_events} />
                <TopPostsCard posts={data.top_posts} />
              </div>
            </>
          ) : (
            <EmptyRecruitments />
          )}
        </div>
      )}

      {postModalOpen && organization.username && (
        <CreatePostModal
          username={organization.username}
          userAvatarUrl={organization.logo || undefined}
          userInitials={organization.name?.slice(0, 2).toUpperCase() || "OR"}
          displayName={organization.name}
          onClose={() => {
            setPostModalOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────  STAT CARDS  ───────────────────────── */
function StatCards({ data }: { data: DashboardData }) {
  const { stats } = data
  return (
    <div className={styles.statGrid}>
      <StatCard
        icon="mdi:bullhorn-variant-outline"
        label="Active recruitments"
        value={fmt(stats.active_recruitments)}
      />
      <StatCard
        icon="mdi:file-account-outline"
        label="Applications"
        value={fmt(stats.total_applications)}
        delta={stats.new_applications_in_range}
      />
      <StatCard
        icon="mdi:account-multiple-outline"
        label="Followers"
        value={fmt(stats.followers_count)}
        delta={stats.new_followers_in_range}
      />
      <StatCard
        icon="mdi:eye-outline"
        label="Recruitment views"
        value={fmt(stats.total_recruitment_views)}
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  delta,
}: {
  icon: string
  label: string
  value: string
  delta?: number
}) {
  return (
    <Card className={styles.statCard}>
      <span className={styles.statIcon}>
        <Icon icon={icon} width={20} height={20} />
      </span>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {delta !== undefined && (
        <span
          className={`${styles.statDelta} ${delta > 0 ? styles.deltaUp : styles.deltaFlat}`}
        >
          {delta > 0 ? `+${fmt(delta)} this period` : "No change this period"}
        </span>
      )}
    </Card>
  )
}

/* ─────────────────────────  PIPELINE  ───────────────────────── */
function PipelineCard({ pipeline }: { pipeline: PipelineCounts }) {
  const max = Math.max(...FUNNEL.map((f) => pipeline[f.key]), 1)
  const totalFunnel = FUNNEL.reduce((s, f) => s + pipeline[f.key], 0)

  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Application pipeline</h2>
      </div>

      {totalFunnel === 0 ? (
        <p className={styles.muted}>No applications yet.</p>
      ) : (
        <ul className={styles.funnel}>
          {FUNNEL.map((f) => {
            const count = pipeline[f.key]
            const width = `${(count / max) * 100}%`
            return (
              <li key={f.key} className={styles.funnelRow}>
                <span className={styles.funnelLabel}>{f.label}</span>
                <span className={styles.funnelTrack}>
                  <span
                    className={styles.funnelFill}
                    style={{ width, background: f.color }}
                  />
                </span>
                <span className={styles.funnelCount}>{count}</span>
              </li>
            )
          })}
        </ul>
      )}

      <div className={styles.funnelFooter}>
        <span className={styles.mutedCount}>
          <Icon icon="mdi:close-circle-outline" width={13} height={13} />
          {pipeline.rejected} rejected
        </span>
        <span className={styles.mutedCount}>
          <Icon icon="mdi:undo-variant" width={13} height={13} />
          {pipeline.withdrawn} withdrawn
        </span>
      </div>
    </Card>
  )
}

/* ─────────────────────  NEEDS ATTENTION  ───────────────────── */
function NeedsAttentionCard({
  needs,
  orgUsername,
}: {
  needs: NeedsAttention
  orgUsername: string
}) {
  const { toRecruitment, toRecruitmentsList } = useNavigation()

  const isEmpty =
    needs.unreviewed_applications === 0 &&
    needs.deadlines_soon.length === 0 &&
    needs.drafts.length === 0 &&
    needs.near_capacity.length === 0

  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Needs attention</h2>
      </div>

      {isEmpty ? (
        <div className={styles.allClear}>
          <Icon icon="mdi:check-circle-outline" width={22} height={22} />
          <span>You&apos;re all caught up.</span>
        </div>
      ) : (
        <ul className={styles.attnList}>
          {needs.unreviewed_applications > 0 && (
            <li className={styles.attnItem}>
              <Link
                href={toRecruitmentsList(orgUsername)}
                className={styles.attnLink}
              >
                <span className={`${styles.attnBadge} ${styles.badgeWarn}`}>
                  {needs.unreviewed_applications}
                </span>
                <span className={styles.attnText}>
                  application{needs.unreviewed_applications === 1 ? "" : "s"}{" "}
                  awaiting review
                </span>
                <Icon
                  className={styles.attnChevron}
                  icon="mdi:chevron-right"
                  width={18}
                  height={18}
                />
              </Link>
            </li>
          )}

          {needs.deadlines_soon.map((d) => {
            const days = dayjs(d.application_deadline).diff(dayjs(), "day")
            return (
              <li key={`dl-${d.id}`} className={styles.attnItem}>
                <Link href={toRecruitment(d.id)} className={styles.attnLink}>
                  <span className={`${styles.attnBadge} ${styles.badgeDanger}`}>
                    <Icon icon="mdi:clock-alert-outline" width={13} height={13} />
                  </span>
                  <span className={styles.attnText}>
                    <strong>{d.title}</strong> closes{" "}
                    {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`}
                  </span>
                  <Icon
                    className={styles.attnChevron}
                    icon="mdi:chevron-right"
                    width={18}
                    height={18}
                  />
                </Link>
              </li>
            )
          })}

          {needs.near_capacity.map((c) => (
            <li key={`cap-${c.id}`} className={styles.attnItem}>
              <Link href={toRecruitment(c.id)} className={styles.attnLink}>
                <span className={`${styles.attnBadge} ${styles.badgeWarn}`}>
                  <Icon icon="mdi:gauge-full" width={13} height={13} />
                </span>
                <span className={styles.attnText}>
                  <strong>{c.title}</strong> at {c.applications_count}/
                  {c.max_applications} applications
                </span>
                <Icon
                  className={styles.attnChevron}
                  icon="mdi:chevron-right"
                  width={18}
                  height={18}
                />
              </Link>
            </li>
          ))}

          {needs.drafts.map((d) => (
            <li key={`dr-${d.id}`} className={styles.attnItem}>
              <Link href={toRecruitment(d.id)} className={styles.attnLink}>
                <span className={`${styles.attnBadge} ${styles.badgeMuted}`}>
                  <Icon icon="mdi:pencil-outline" width={13} height={13} />
                </span>
                <span className={styles.attnText}>
                  <strong>{d.title}</strong> is a draft — publish it
                </span>
                <Icon
                  className={styles.attnChevron}
                  icon="mdi:chevron-right"
                  width={18}
                  height={18}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ─────────────────────  RECRUITMENTS TABLE  ───────────────────── */
function RecruitmentsTable({ rows }: { rows: RecruitmentRow[] }) {
  const { toRecruitment } = useNavigation()

  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Recruitments</h2>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th className={styles.num}>Views</th>
              <th className={styles.num}>Applications</th>
              <th className={styles.num}>Conversion</th>
              <th>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = REC_STATUS[row.status] ?? {
                label: row.status,
                cls: styles.stClosed,
              }
              const days = row.application_deadline
                ? dayjs(row.application_deadline).diff(dayjs(), "day")
                : null
              const soon = days !== null && days >= 0 && days < 7
              return (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={toRecruitment(row.id)}
                      className={styles.tableTitle}
                    >
                      {row.title}
                    </Link>
                    <span className={styles.tableType}>
                      {prettyType(row.recruitment_type)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.recBadge} ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className={styles.num}>{fmt(row.views_count)}</td>
                  <td className={styles.num}>{fmt(row.applications_count)}</td>
                  <td className={styles.num}>{row.conversion}%</td>
                  <td>
                    {row.application_deadline ? (
                      <span
                        className={`${styles.deadline} ${soon ? styles.deadlineSoon : ""}`}
                      >
                        {dayjs(row.application_deadline).format("MMM D")}
                        {soon && (
                          <Icon
                            icon="mdi:clock-alert-outline"
                            width={13}
                            height={13}
                          />
                        )}
                      </span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ─────────────────────  UPCOMING EVENTS  ───────────────────── */
function UpcomingEventsCard({ events }: { events: UpcomingEvent[] }) {
  const { toRecruitment } = useNavigation()

  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Upcoming events</h2>
      </div>

      {events.length === 0 ? (
        <p className={styles.muted}>No scheduled events.</p>
      ) : (
        <ul className={styles.eventList}>
          {events.map((ev) => (
            <li key={ev.id} className={styles.eventItem}>
              <div className={styles.eventDate}>
                <span className={styles.eventMonth}>
                  {dayjs(ev.event_date).format("MMM")}
                </span>
                <span className={styles.eventDay}>
                  {dayjs(ev.event_date).format("D")}
                </span>
              </div>
              <div className={styles.eventBody}>
                <Link
                  href={toRecruitment(ev.id)}
                  className={styles.eventTitle}
                >
                  {ev.title}
                </Link>
                <span className={styles.eventMeta}>
                  <Icon icon="mdi:clock-outline" width={13} height={13} />
                  {dayjs(ev.event_date).format("ddd, h:mm A")}
                </span>
                {(ev.venue_name || ev.city) && (
                  <span className={styles.eventMeta}>
                    <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                    {[ev.venue_name, ev.city].filter(Boolean).join(", ")}
                  </span>
                )}
                {ev.age_categories.length > 0 && (
                  <div className={styles.reportTimes}>
                    {ev.age_categories.map((cat, i) => (
                      <span key={i} className={styles.reportTag}>
                        {cat.title}
                        {cat.reporting_time ? ` · ${cat.reporting_time}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ─────────────────────────  TOP POSTS  ───────────────────────── */
function TopPostsCard({ posts }: { posts: TopPost[] }) {
  const { toPost } = useNavigation()

  return (
    <Card className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Top posts</h2>
      </div>

      {posts.length === 0 ? (
        <p className={styles.muted}>No posts in this period.</p>
      ) : (
        <ul className={styles.postList}>
          {posts.map((post) => (
            <li key={post.id} className={styles.postItem}>
              <Link
                href={toPost(post.id, "organization")}
                className={styles.postLink}
              >
                <span className={styles.postThumb}>
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Icon
                      icon="mdi:text-box-outline"
                      width={18}
                      height={18}
                    />
                  )}
                </span>
                <span className={styles.postBody}>
                  <span className={styles.postText}>
                    {post.text || "Media post"}
                  </span>
                  <span className={styles.postStats}>
                    <span>
                      <Icon icon="mdi:heart-outline" width={13} height={13} />
                      {fmt(post.likes_count)}
                    </span>
                    <span>
                      <Icon
                        icon="mdi:comment-outline"
                        width={13}
                        height={13}
                      />
                      {fmt(post.comments_count)}
                    </span>
                    <span className={styles.postTime}>
                      {dayjs(post.created_at).fromNow()}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ─────────────────────────  STATES  ───────────────────────── */
function EmptyRecruitments() {
  return (
    <Card className={styles.emptyPanel}>
      <span className={styles.emptyIcon}>
        <Icon icon="mdi:bullhorn-variant-outline" width={30} height={30} />
      </span>
      <h2 className={styles.emptyTitle}>No recruitments yet</h2>
      <p className={styles.emptyText}>
        Publish your first recruitment to start receiving applications and see
        your pipeline come to life.
      </p>
      <CreateRecruitmentTrigger>
        {(open) => (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={open}
          >
            <Icon icon="mdi:plus" width={16} height={16} />
            <span>Create your first recruitment</span>
          </button>
        )}
      </CreateRecruitmentTrigger>
    </Card>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className={styles.emptyPanel}>
      <span className={`${styles.emptyIcon} ${styles.emptyIconError}`}>
        <Icon icon="mdi:alert-circle-outline" width={30} height={30} />
      </span>
      <h2 className={styles.emptyTitle}>Couldn&apos;t load your dashboard</h2>
      <p className={styles.emptyText}>
        Something went wrong fetching your overview. Please try again.
      </p>
      <button type="button" className={styles.primaryAction} onClick={onRetry}>
        <Icon icon="mdi:refresh" width={16} height={16} />
        <span>Retry</span>
      </button>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className={styles.body} aria-hidden="true">
      <div className={styles.statGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${styles.statCard} ${styles.skelCard}`}>
            <span className={`${styles.skel} ${styles.skelIcon}`} />
            <span className={`${styles.skel} ${styles.skelLine}`} />
            <span className={`${styles.skel} ${styles.skelValue}`} />
          </div>
        ))}
      </div>
      <div className={styles.twoCol}>
        <div className={`${styles.panel} ${styles.skelPanel}`} />
        <div className={`${styles.panel} ${styles.skelPanel}`} />
      </div>
      <div className={`${styles.panel} ${styles.skelPanel}`} />
    </div>
  )
}
