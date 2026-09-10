/**
 * The public (logged-out) recruitment detail.
 *
 * Deliberately NOT the shared axios instance and deliberately NOT the
 * `useRecruitmentDetail` React Query hook, for the reason spelled out in
 * features/profile/services/publicProfile.api.ts: `core/api/axios.ts` reads
 * `useAuthStore` in a request interceptor, and a Zustand store on the server is
 * a module-level singleton shared across every concurrent request. This fetch
 * runs on the server for every render of /r/<id>, so it uses `fetchPublic` —
 * the same plain-`fetch` helper the public profile and the Sports CV use, ISR
 * window and all. Imported rather than copied so there is one description of
 * that hazard.
 *
 * `/public/recruitments/<id>` is anonymous by design (see core/public_urls.py),
 * so there is no token to send in the first place — and the payload it returns
 * is the PUBLIC serializer's, for every caller including the posting org. That
 * is why the type below is a narrowing of `RecruitmentDetail` rather than an
 * alias: `views_count`, `saves_count`, `status`, `max_applications`,
 * `shortlisted_count` and `selected_count` are owner-only and can never appear
 * here.
 */

import { fetchPublic, type PublicFetchResult } from "@/features/profile/services/publicProfile.api"
import type { RecruitmentDetail } from "./recruitments.api"

/**
 * What /public/recruitments/<id> returns.
 *
 * `RecruitmentDetailSerializer`'s field list exactly — the owner-only keys are
 * subtracted at the type level so a component rendered from this payload cannot
 * reach for a number the endpoint does not send.
 *
 * `my_application`, `can_apply` and `is_saved` DO ship (they are on the public
 * serializer) but are always the anonymous answers — null / false / false —
 * for a visitor with no session, which is what the login-walled actions on the
 * page assume.
 */
export type PublicRecruitmentDetail = Omit<
  RecruitmentDetail,
  | "status"
  | "max_applications"
  | "shortlisted_count"
  | "selected_count"
  | "views_count"
  | "saves_count"
  | "published_at"
  | "updated_at"
>

/**
 * The full result, for the page component. "This posting is not public" and
 * "we could not reach the API" have to be told apart: the first is a real
 * answer about a draft, a closed trial or a followers-only posting, the second
 * is our own outage, and a signed-in visitor is entitled to a posting the
 * anonymous payload refuses.
 */
export function getPublicRecruitmentResult(
  recruitmentId: string
): Promise<PublicFetchResult<PublicRecruitmentDetail>> {
  return fetchPublic<PublicRecruitmentDetail>(
    `/public/recruitments/${encodeURIComponent(recruitmentId)}`
  )
}
