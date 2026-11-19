"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createProgramApi,
  deleteProgramApi,
  getProgramsApi,
  reorderProgramsApi,
  updateProgramApi,
} from "../services/orgPage.api"
import type { Program, ProgramWritePayload } from "../types"
import { pageKeys } from "./useOrgPage"
import { inOrder, useOptimisticReorder } from "./reorder"
import { invalidateShowcases } from "./usePageShowcase"

/** The most programs a page holds (program_limit on the server). */
export const MAX_PROGRAMS = 30

export const usePrograms = (orgId: string) =>
  useQuery({
    queryKey: pageKeys.programs(orgId),
    queryFn: () => getProgramsApi(orgId),
    enabled: !!orgId,
  })

/** A program write moves the hub's count and readiness too. */
function useAfterProgramWrite(orgId: string) {
  const queryClient = useQueryClient()
  return (update?: (programs: Program[]) => Program[]) => {
    if (update) {
      queryClient.setQueryData<Program[]>(pageKeys.programs(orgId), (old) => (old ? update(old) : old))
    }
    queryClient.invalidateQueries({ queryKey: pageKeys.programs(orgId) })
    queryClient.invalidateQueries({ queryKey: pageKeys.admin(orgId) })
    invalidateShowcases(queryClient)
  }
}

export const useCreateProgram = (orgId: string) => {
  const after = useAfterProgramWrite(orgId)
  return useMutation({
    mutationFn: (payload: ProgramWritePayload) => createProgramApi(orgId, payload),
    onSuccess: (program) => after((programs) => [...programs, program]),
  })
}

export const useUpdateProgram = (orgId: string, programId: string) => {
  const after = useAfterProgramWrite(orgId)
  return useMutation({
    mutationFn: (payload: Partial<ProgramWritePayload>) => updateProgramApi(orgId, programId, payload),
    onSuccess: (program) =>
      after((programs) => programs.map((existing) => (existing.id === program.id ? program : existing))),
  })
}

export const useDeleteProgram = (orgId: string) => {
  const after = useAfterProgramWrite(orgId)
  return useMutation({
    mutationFn: (programId: string) => deleteProgramApi(orgId, programId),
    onSuccess: (_answer, programId) =>
      after((programs) => programs.filter((program) => program.id !== programId)),
  })
}

export const useReorderPrograms = (orgId: string) => {
  const queryClient = useQueryClient()
  return useOptimisticReorder<Program[], Program[]>({
    queryKey: pageKeys.programs(orgId),
    reorder: (programs, ids) => inOrder(programs, ids),
    send: (ids) => reorderProgramsApi(orgId, ids),
    onAnswer: (programs) => queryClient.setQueryData(pageKeys.programs(orgId), programs),
  })
}
