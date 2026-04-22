"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import api from "@/core/api/axios"

import { createOrganizationApi } from "../services/organization.api"
import { CreateOrganizationPayload, OrganizationMini } from "../types"

const fetchOrganizations = async (): Promise<OrganizationMini[]> => {
  const res = await api.get("/organizations/list")
  return res.data.data
}

export const useOrganizations = () => {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
    staleTime: 1000 * 60 * 5,
  })
}

export const orgKeys = {
  all: () => ["organizations"] as const,
  list: () => ["organizations", "list"] as const,
}

// ── Create organization ───────────────────────────────────────

export const useCreateOrganization = () => {
  const qc = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (payload: CreateOrganizationPayload) =>
      createOrganizationApi(payload),

    onSuccess: (org) => {
      // refresh organization queries
      qc.invalidateQueries({ queryKey: orgKeys.all() })

      // redirect to org admin home
      router.push(`/organization/admin/${org.id}/home`)
    },
  })
}