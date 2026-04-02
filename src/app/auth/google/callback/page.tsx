export const dynamic = "force-dynamic"

import ClientGoogleCallback from "@/features/auth/components/SocialAuth/ClientGoogleCallback"

type PageProps = {
    searchParams?: {
        code?: string
        state?: string
    }
}

export default function Page({ searchParams }: PageProps) {
    return (
        <ClientGoogleCallback
            code={searchParams?.code ?? null}
            state={searchParams?.state ?? null}
        />
    )
}