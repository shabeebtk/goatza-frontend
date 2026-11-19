"use client"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import { isAxiosError } from "axios"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import {
  getEnquiryAlertsApi,
  getEnquiryApi,
  getInboxApi,
  getUnreadCountApi,
  updateEnquiryAlertsApi,
  updateEnquiryApi,
} from "../services/enquiries.api"
import type {
  EnquiryAlerts,
  EnquiryDetail,
  EnquiryStatus,
  InboxFilters,
  InboxItem,
  InboxPage,
  UpdateEnquiryBody,
} from "../types"

// ── Query keys ────────────────────────────────────────────────

/**
 * An org's inbox, details and unread count all sit under ["enquiries", orgId];
 * the person's own email switches under "me". A foreground enquiry push drops the
 * whole ["enquiries"] tree.
 */
export const enquiryKeys = {
  all: () => ["enquiries"] as const,
  org: (orgId: string) => ["enquiries", orgId] as const,
  inboxes: (orgId: string) => ["enquiries", orgId, "inbox"] as const,
  inbox: (orgId: string, filters: InboxFilters) =>
    ["enquiries", orgId, "inbox", filters.status, filters.program_id ?? "", filters.location_id ?? ""] as const,
  detail: (orgId: string, enquiryId: string) => ["enquiries", orgId, "detail", enquiryId] as const,
  unread: (orgId: string) => ["enquiries", orgId, "unread"] as const,
  myAlerts: () => ["enquiries", "me", "alerts"] as const,
  alerts: (orgId: string) => ["enquiries", "me", "alerts", orgId] as const,
}

const isForbidden = (err: unknown) => isAxiosError(err) && err.response?.status === 403
const isMissing = (err: unknown) => isAxiosError(err) && err.response?.status === 404

// ── The inbox ─────────────────────────────────────────────────

type InboxData = InfiniteData<InboxPage, string | null>

/** Newest first, 20 a page, the next page on `next_cursor`. The filters are in the key. */
export const useInbox = (orgId: string, filters: InboxFilters) =>
  useInfiniteQuery({
    queryKey: enquiryKeys.inbox(orgId, filters),
    queryFn: ({ pageParam }) => getInboxApi(orgId, { ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!orgId,
    retry: (count, err) => !isForbidden(err) && count < 2,
  })

export const useEnquiry = (orgId: string, enquiryId: string) =>
  useQuery({
    queryKey: enquiryKeys.detail(orgId, enquiryId),
    queryFn: () => getEnquiryApi(orgId, enquiryId),
    enabled: !!orgId && !!enquiryId,
    // A 404 (another org, deleted, purged) and a 403 are answers, not blips.
    retry: (count, err) => !isForbidden(err) && !isMissing(err) && count < 2,
  })

/**
 * New enquiries for the badge: fresh for 30 s, polled every 60 s while mounted,
 * and again when the window comes back. A foreground push refreshes it sooner.
 */
export const useEnquiryUnreadCount = (orgId: string, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: enquiryKeys.unread(orgId),
    queryFn: () => getUnreadCountApi(orgId),
    enabled: enabled && !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isForbidden(err) && count < 2,
  })

// ── Moving a row between tabs ─────────────────────────────────

/** Where a row sits among the cached inboxes, and every cache it could touch. */
function inboxEntries(queryClient: QueryClient, orgId: string) {
  return queryClient.getQueriesData<InboxData>({ queryKey: enquiryKeys.inboxes(orgId) })
}

function filtersOf(key: QueryKey): { status: string; program: string; location: string } {
  return { status: String(key[3]), program: String(key[4] ?? ""), location: String(key[5] ?? "") }
}

function findRow(queryClient: QueryClient, orgId: string, enquiryId: string): InboxItem | undefined {
  for (const [, data] of inboxEntries(queryClient, orgId)) {
    for (const page of data?.pages ?? []) {
      const row = page.items.find((item) => item.id === enquiryId)
      if (row) return row
    }
  }
  const detail = queryClient.getQueryData<EnquiryDetail>(enquiryKeys.detail(orgId, enquiryId))
  return detail
}

const byNewest = (a: InboxItem, b: InboxItem) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)

/**
 * Every cached inbox after `row` moves from `from` to `to`: out of the `from` tab,
 * into the `to` tab (in date order) and both counts adjusted, in each list whose
 * program and branch filters it was seen under.
 */
export function moveRowInCaches(
  queryClient: QueryClient,
  orgId: string,
  row: InboxItem,
  from: EnquiryStatus,
  to: EnquiryStatus
) {
  const entries = inboxEntries(queryClient, orgId)

  // The filter pairs the row belongs to: wherever it is listed now, plus "all".
  const scopes = new Set<string>(["|"])
  for (const [key, data] of entries) {
    const { program, location } = filtersOf(key)
    if (data?.pages.some((page) => page.items.some((item) => item.id === row.id))) {
      scopes.add(`${program}|${location}`)
    }
  }

  for (const [key, data] of entries) {
    if (!data) continue
    const { status, program, location } = filtersOf(key)
    if (!scopes.has(`${program}|${location}`)) continue

    const pages = data.pages.map((page, index) => {
      let items = page.items
      if (status === from) items = items.filter((item) => item.id !== row.id)
      if (status === to && index === 0 && !items.some((item) => item.id === row.id)) {
        items = [...items, { ...row, status: to }].sort(byNewest)
      }
      const counts = { ...page.counts }
      counts[from] = Math.max(0, (counts[from] ?? 0) - 1)
      counts[to] = (counts[to] ?? 0) + 1
      return { ...page, items, counts }
    })
    queryClient.setQueryData<InboxData>(key, { ...data, pages })
  }
}

/**
 * A status or notes change. A status change is optimistic: the row leaves its tab
 * and joins the new one, the counts and the unread badge move, and a refusal
 * puts every one of them back. Then the inbox, the detail and the count refetch.
 */
export const useUpdateEnquiry = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ enquiryId, body }: { enquiryId: string; body: UpdateEnquiryBody }) =>
      updateEnquiryApi(orgId, enquiryId, body),
    onMutate: async ({ enquiryId, body }) => {
      if (!body.status) return { snapshot: [] as [QueryKey, unknown][] }
      await queryClient.cancelQueries({ queryKey: enquiryKeys.org(orgId) })

      const snapshot: [QueryKey, unknown][] = [
        ...inboxEntries(queryClient, orgId),
        [enquiryKeys.detail(orgId, enquiryId), queryClient.getQueryData(enquiryKeys.detail(orgId, enquiryId))],
        [enquiryKeys.unread(orgId), queryClient.getQueryData(enquiryKeys.unread(orgId))],
      ]

      const row = findRow(queryClient, orgId, enquiryId)
      const to = body.status
      if (row && row.status !== to) {
        const from = row.status
        moveRowInCaches(queryClient, orgId, row, from, to)
        queryClient.setQueryData<EnquiryDetail>(enquiryKeys.detail(orgId, enquiryId), (old) =>
          old ? { ...old, status: to } : old
        )
        queryClient.setQueryData<{ new: number }>(enquiryKeys.unread(orgId), (old) =>
          old
            ? { new: Math.max(0, old.new + (to === "new" ? 1 : 0) - (from === "new" ? 1 : 0)) }
            : old
        )
      }
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
    },
    onSuccess: (detail) => queryClient.setQueryData(enquiryKeys.detail(orgId, detail.id), detail),
    onSettled: (_data, _err, { enquiryId }) => {
      queryClient.invalidateQueries({ queryKey: enquiryKeys.inboxes(orgId) })
      queryClient.invalidateQueries({ queryKey: enquiryKeys.detail(orgId, enquiryId) })
      queryClient.invalidateQueries({ queryKey: enquiryKeys.unread(orgId) })
    },
  })
}

// ── The person's email switch, per org ────────────────────────

export const useEnquiryAlerts = (orgId: string) =>
  useQuery({
    queryKey: enquiryKeys.alerts(orgId),
    queryFn: () => getEnquiryAlertsApi(orgId),
    enabled: !!orgId,
    // A 404 is an answer (no longer handles enquiries there), not a blip.
    retry: false,
  })

/** Optimistic: the switch moves at once; a refusal puts it back and says why. */
export const useUpdateEnquiryAlerts = (orgId: string) => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (email: boolean) => updateEnquiryAlertsApi(orgId, email),
    onMutate: async (email) => {
      const key = enquiryKeys.alerts(orgId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<EnquiryAlerts>(key)
      queryClient.setQueryData<EnquiryAlerts>(key, { email })
      return { previous }
    },
    onError: (err, _email, context) => {
      queryClient.setQueryData(enquiryKeys.alerts(orgId), context?.previous)
      toast.show({
        title: "Couldn't change enquiry emails",
        message: getApiErrorMessage(err),
        variant: "error",
        position: "top-center",
      })
    },
    onSuccess: (answer) => queryClient.setQueryData(enquiryKeys.alerts(orgId), answer),
  })
}
