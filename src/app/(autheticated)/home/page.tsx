"use client"

import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import api from "@/core/api/axios"
import FeedList from "@/features/feed/components/FeedList/FeedList"
import InstallBanner from "@/features/install/components/InstallBanner/InstallBanner"

export default function HomePage() {

  return (
    <div>
      {/* Phones only, and never once installed: InstallBanner decides. */}
      <FeedList top={<InstallBanner />} />
    </div>
  )
}