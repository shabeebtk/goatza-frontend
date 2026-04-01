"use client"

import { useLogin } from "@/features/auth/hooks/useLogin"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const { mutate, isPending } = useLogin()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    mutate(
      { email, password },
      {
        onSuccess: () => {
          router.push("/profile") // ✅ redirect to home
        },
      }
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />

        <button type="submit" disabled={isPending}>
          {isPending ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  )
}