"use client"

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { pageErrorSentence, pageFieldErrors } from "../pageErrors"
import { invalidateShowcases } from "./usePageShowcase"

/** `ids` with `id` moved one place up (-1) or down (+1), or null at an end. */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return null
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** `items` in the order `ids` gives; anything not named keeps its place at the end. */
export function inOrder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item))
  const named = new Set(ids)
  return [...ordered, ...items.filter((item) => !named.has(item.id))]
}

/**
 * A reorder, optimistically: the cached list takes the new order at once, the
 * full id list goes to the server, and a refusal puts the old order back and
 * toasts. "The list changed" (the server's ids check on `ids`) also refetches,
 * because the list on screen is stale.
 */
export function useOptimisticReorder<TData, TAnswer = unknown>({
  queryKey,
  reorder,
  send,
  onAnswer,
}: {
  queryKey: QueryKey
  /** The cached data with its list in the order of `ids`. */
  reorder: (data: TData, ids: string[]) => TData
  send: (ids: string[]) => Promise<TAnswer>
  /** What to do with the server's answer, if it carries the list. */
  onAnswer?: (answer: TAnswer) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: send,
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TData>(queryKey)
      if (previous !== undefined) queryClient.setQueryData<TData>(queryKey, reorder(previous, ids))
      return { previous }
    },
    onError: (err, _ids, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous)
      const stale = Boolean(pageFieldErrors(err).ids)
      if (stale) queryClient.invalidateQueries({ queryKey })
      toast.show({
        title: "Couldn't save the new order",
        message: pageErrorSentence(err),
        variant: "error",
        position: "top-center",
      })
    },
    onSuccess: (answer) => {
      onAnswer?.(answer)
      // What visitors see is in the new order too.
      invalidateShowcases(queryClient)
    },
  })
}
