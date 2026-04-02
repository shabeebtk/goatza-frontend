"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useGoogleAuth } from "@/features/auth/hooks/useAuthMutations"

type Props = {
    code: string | null
    state: string | null
}

export default function ClientGoogleCallback({ code, state }: Props) {
    const router = useRouter()
    const googleAuth = useGoogleAuth()

    useEffect(() => {
        if (!code || !state) {
            router.replace("/auth")
            return
        }

        googleAuth.mutate(
            { code, state },
            {
                onSuccess: () => router.replace("/profile"),
                onError: () => router.replace("/auth"),
            }
        )
    }, [code, state])

    return <div>Signing you in...</div>
}