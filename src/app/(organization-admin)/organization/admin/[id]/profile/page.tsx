"use client"

import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import api from "@/core/api/axios"
import FeedList from "@/features/feed/components/FeedList/FeedList"

export default function OrganizationAdminHomePage() {
  
  return (
    <div>
      admin profile page
    </div>
  )
}