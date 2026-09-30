"use client"

/**
 * /recruitments/recommended — where the "Recommended for you" rail's
 * "See all" lands. Thin, like every other route file here.
 *
 * The rail used to point at `?<filters>#all`, which for THIS rail meant the
 * current URL plus a hash, with `scroll={false}` on the link — so the one
 * "See all" that carried no filter to apply did nothing at all when it was
 * tapped.
 */

import RecommendedRecruitments from "@/features/recruitments/components/RecommendedRecruitments/RecommendedRecruitments"

export default function RecommendedRecruitmentsPage() {
  return <RecommendedRecruitments />
}
