"use client"

/**
 * Binds one <video> element to the global sound state (`sound.store.ts`).
 *
 * JSX RULE, and it is not optional: every <video> keeps a BARE `muted`
 * attribute so the server-rendered markup and the first client paint are
 * always muted. Never write `muted={isMuted}` — React does not reliably render
 * `muted` as a DOM attribute (it is a property), which is exactly how the feed
 * ended up handing the autoplay policy an unmuted element and having playback
 * silently refused. This hook takes over after mount and sets the PROPERTY.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react"

import { useSoundStore } from "@/store/sound.store"

export type VideoSound = {
    /** The global state — drive icons and aria-pressed from this. */
    muted: boolean
    /** Flip the global state (mute button / tap-for-sound / "m"). */
    toggleMuted: () => void
    /**
     * Write the mute state onto the element as a property, right now.
     *
     * Needed on top of the effect below because the autoplay policy reads the
     * property at the moment `play()` is called: a state change and a play()
     * in the same tick would otherwise race the effect.
     */
    applyMuted: (next: boolean) => void
    /**
     * The current global state, readable from callbacks that are created once
     * (an IntersectionObserver's) without making them depend on it.
     */
    mutedRef: RefObject<boolean>
    /** Wire to the element's `onVolumeChange` when it renders native controls. */
    onVolumeChange: (e: React.SyntheticEvent<HTMLVideoElement>) => void
    /**
     * Call from `play().catch()`. The browser refused unmuted playback, so the
     * whole app drops to muted — one blocked video must not leave every other
     * icon claiming sound is on.
     */
    reportBlocked: () => void
}

export function useVideoSound(
    videoRef: RefObject<HTMLVideoElement | null>
): VideoSound {
    const muted = useSoundStore((s) => s.muted)
    const setMuted = useSoundStore((s) => s.setMuted)
    const toggleMuted = useSoundStore((s) => s.toggleMuted)
    const forceMute = useSoundStore((s) => s.forceMute)

    const mutedRef = useRef(muted)

    // ── a. store → element ────────────────────────────────────
    const applyMuted = useCallback(
        (next: boolean) => {
            const el = videoRef.current
            if (!el) return
            el.muted = next
            el.defaultMuted = next
        },
        [videoRef]
    )

    useEffect(() => {
        mutedRef.current = muted
        applyMuted(muted)
    }, [applyMuted, muted])

    // ── b. element → store (native controls) ──────────────────
    // RecruitmentDetail and VideoMessage render `controls`, so the user can
    // mute from the browser's own UI. Without this the native control becomes
    // a second source of truth and the rest of the app never hears about it.
    const onVolumeChange = useCallback(
        (e: React.SyntheticEvent<HTMLVideoElement>) => {
            const next = e.currentTarget.muted
            // Read the LIVE store value, not the closed-over one: this handler
            // also fires for the writes (a) just made, and echoing those back
            // is the feedback loop.
            if (next === useSoundStore.getState().muted) return
            setMuted(next)
        },
        [setMuted]
    )

    // ── c. rejection reporter ─────────────────────────────────
    const reportBlocked = useCallback(() => {
        forceMute()
    }, [forceMute])

    return { muted, toggleMuted, applyMuted, mutedRef, onVolumeChange, reportBlocked }
}
