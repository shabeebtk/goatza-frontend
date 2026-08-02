"use client"

import OrgVerificationsPage from "@/features/career/components/OrgVerificationsPage/OrgVerificationsPage"

export default function OrgCareerVerificationsPage() {
  // The queue is scoped entirely by the acting-org headers, so the route's
  // [id] is only here to keep the page inside the admin route space —
  // OrgMemberGuard and ActorRouteSync have already resolved the actor.
  return <OrgVerificationsPage />
}
