"use client"

import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import api from "@/core/api/axios"

type ExploreUser = {
  id: string
  name: string
  username: string
  profile_photo?: string
}

type ExploreOrg = {
  id: string
  name: string
  username: string
  type: string
  logo?: string
  headline?: string
  is_verified?: boolean
}

const AVATAR_FALLBACK =
  "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"

export default function HomePage() {
  const { user, isAuthenticated, isLoading, clearAuth } = useAuthStore()
  const router = useRouter()
  const [users, setUsers] = useState<ExploreUser[]>([])
  const [orgs, setOrgs] = useState<ExploreOrg[]>([])

  useEffect(() => {
    if (user) {
      api.get("/user/list/all").then((res) => {
        setUsers(res.data.data)
      }).catch((err) => console.error(err))

      api.get("/organizations/list/all").then((res) => {
        setOrgs(res.data.data)
      }).catch((err) => console.error(err))
    }
  }, [user])

  if (!user) return <div>No user</div>

  return (
    <div style={{ padding: 20 }}>
      <h2>Home</h2>

      <p>Welcome: {user.username}</p>
      <p>Email: {user.email}</p>

      <button
        onClick={async () => {
          try {
            await logoutApi() 
          } catch (e) { }

          clearAuth()
          router.push("/auth")
        }}
      >
        Logout
      </button>

      <hr style={{ margin: "20px 0" }} />
      
      <h3>Testing: List of Users</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {users.map(u => (
          <div key={u.id} style={{ display: "flex", gap: "10px", alignItems: "center", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
            <img src={u.profile_photo || AVATAR_FALLBACK} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            <div>
              <strong>{u.name}</strong> (@{u.username})
            </div>
            <Link href={`/profile/${u.username}`} style={{ marginLeft: "auto", color: "blue", textDecoration: "underline" }}>
              View Profile
            </Link>
          </div>
        ))}
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h3>Testing: List of Organizations</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {orgs.map(o => (
          <div key={o.id} style={{ display: "flex", gap: "10px", alignItems: "center", border: "1px solid #ccc", padding: "10px", borderRadius: "8px" }}>
            <img src={o.logo || AVATAR_FALLBACK} alt="logo" style={{ width: 40, height: 40, borderRadius: "8px", objectFit: "cover" }} />
            <div>
              <strong>{o.name}</strong> (@{o.username})
              {o.is_verified && <span title="Verified" style={{ marginLeft: 4 }}>✔️</span>}
              {o.headline && <div style={{ fontSize: 12, color: "#666" }}>{o.headline}</div>}
            </div>
            <Link href={`/organization/profile/${o.username}`} style={{ marginLeft: "auto", color: "blue", textDecoration: "underline" }}>
              View Profile
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}