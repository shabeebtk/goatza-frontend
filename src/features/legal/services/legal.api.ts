import api from "@/core/api/axios"

/**
 * The consent write, and the public version list.
 *
 * Note the asymmetry with `shared/services/legal.ts`: that one reads the
 * MARKDOWN off disk at build time and is server-only. This one talks to the
 * API about a PERSON — what they have accepted and what they still owe. The
 * documents are static; the consent is not.
 */

export type AcceptResponse = {
  accepted: string[]
  pending: string[]
}

/**
 * Record acceptance of the named documents for the signed-in user.
 *
 * The version is never sent — the server pulls it from its own registry, so a
 * client cannot accept a version that was never published or re-accept a
 * superseded one. `legal/accept` is exempt from the consent gate, which is
 * what lets a blocked user call it at all.
 */
export const acceptLegalApi = async (
  documents: string[],
): Promise<AcceptResponse> => {
  const res = await api.post("/legal/accept", { documents })
  return res.data.data
}

export type LegalVersions = Record<string, string>

/**
 * The version every document is currently published at. Public — no token
 * needed — and the same four constants for everybody, so it is safe to cache
 * hard.
 */
export const getLegalVersionsApi = async (): Promise<LegalVersions> => {
  const res = await api.get("/legal/versions")
  return res.data.data
}
