/**
 * Can the server convert a file this browser cannot? GET /media/capabilities.
 *
 * When it can, a video or photo the phone fails to prepare goes up as its
 * ORIGINAL (a "source", see sourceUpload.ts) and a worker converts it. When it
 * cannot — the flag is off, the worker is down, the request failed — every
 * flow behaves exactly as it did before server processing existed.
 *
 * A failed request is `server_processing: false`, never an error anybody
 * sees: the answer only ever widens what the app accepts.
 */

import { useEffect } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"

import api from "@/core/api/axios"
import { queryClient } from "@/core/react-query/QueryProvider"

/** What a server-side conversion is FOR — decides its duration cap. */
export type MediaPurpose = "posts" | "highlights" | "chat" | "recruitments"

export type MediaCapabilities = {
    server_processing: boolean
    limits: {
        source_video_bytes: number
        source_image_bytes: number
        max_duration_seconds: Record<MediaPurpose, number>
    }
}

const MB = 1024 * 1024

/**
 * The answer when there is no answer. The limits mirror the backend's, so a
 * caller that reads them never has to special-case "unknown".
 */
export const NO_SERVER_PROCESSING: MediaCapabilities = {
    server_processing: false,
    limits: {
        source_video_bytes: 300 * MB,
        source_image_bytes: 25 * MB,
        max_duration_seconds: { posts: 300, recruitments: 300, highlights: 90, chat: 90 },
    },
}

export const MEDIA_CAPABILITIES_KEY = ["media", "capabilities"] as const

const STALE_MS = 5 * 60_000

const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0

/** Never rejects. Anything unexpected reads as "no server processing". */
export async function fetchMediaCapabilities(): Promise<MediaCapabilities> {
    try {
        const res = await api.get("/media/capabilities")
        const data = res.data?.data as Partial<MediaCapabilities> | undefined
        const limits = data?.limits
        if (typeof data?.server_processing !== "boolean" || !limits) return NO_SERVER_PROCESSING

        return {
            server_processing: data.server_processing,
            limits: {
                source_video_bytes: isNumber(limits.source_video_bytes)
                    ? limits.source_video_bytes
                    : NO_SERVER_PROCESSING.limits.source_video_bytes,
                source_image_bytes: isNumber(limits.source_image_bytes)
                    ? limits.source_image_bytes
                    : NO_SERVER_PROCESSING.limits.source_image_bytes,
                max_duration_seconds: {
                    ...NO_SERVER_PROCESSING.limits.max_duration_seconds,
                    ...(limits.max_duration_seconds ?? {}),
                },
            },
        }
    } catch {
        return NO_SERVER_PROCESSING
    }
}

const capabilitiesQuery = {
    queryKey: MEDIA_CAPABILITIES_KEY,
    queryFn: fetchMediaCapabilities,
    staleTime: STALE_MS,
}

/** The capabilities, or {@link NO_SERVER_PROCESSING} until they are known. */
export function useMediaCapabilities(): MediaCapabilities {
    const { data } = useQuery(capabilitiesQuery)
    return data ?? NO_SERVER_PROCESSING
}

/**
 * Whatever is cached right now — for a check that cannot wait (a picker's
 * `accept`, an extension check). Falls back to "no server processing".
 */
export function getMediaCapabilitiesSync(): MediaCapabilities {
    return (
        queryClient.getQueryData<MediaCapabilities>(MEDIA_CAPABILITIES_KEY) ??
        NO_SERVER_PROCESSING
    )
}

/**
 * The capabilities, fetched if the cache has none — for the decision that
 * matters (prepare on the phone, or hand the original to the server), which
 * is already async and must not be made on a cold cache.
 */
export function ensureMediaCapabilities(
    client: QueryClient = queryClient
): Promise<MediaCapabilities> {
    return client.ensureQueryData(capabilitiesQuery)
}

/** Fetch once after sign-in. Mounted by AppShell and OrgShell. */
export function usePrefetchMediaCapabilities(): void {
    const client = useQueryClient()
    useEffect(() => {
        void client.prefetchQuery(capabilitiesQuery)
    }, [client])
}
