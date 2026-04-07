"use client"

import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import api from "@/core/api/axios"

export default function HomePage() {
  const { user, isAuthenticated, isLoading, clearAuth } = useAuthStore()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])

  useEffect(() => {
    if (user) {
      api.get("/user/list/all").then((res: any) => {
        setUsers(res.data.data)
      }).catch((err: any) => console.error(err))
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
            <img src={u.profile_photo || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            <div>
              <strong>{u.name}</strong> (@{u.username})
            </div>
            <Link href={`/profile/${u.username}`} style={{ marginLeft: "auto", color: "blue", textDecoration: "underline" }}>
              View Profile
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}