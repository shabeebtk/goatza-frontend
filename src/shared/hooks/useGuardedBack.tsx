"use client"

/**
 * useGuardedBack — one history entry for an overlay that may refuse a back press.
 *
 * useBackToClose consumes its entry on popstate and then calls back, so by the
 * time an overlay hears the press the entry is already gone. The diary's sheet
 * wants that press to ask "discard?" when the form is dirty, and the detail
 * modal wants to stay put while a delete is running, and OrgPhotoCropSheet
 * while Apply is uploading. So the hook lives in a null component that is
 * remounted by `key` after a refused press, which reserves a fresh entry. Same
 * shape as the back handling in CreateRecruitmentModal.
 *
 * Every self-close goes through `close()`, which walks back through the entry so
 * it is never left behind. The overlay is closed by the pop, not before it.
 */

import { useEffect, useRef, useState, type RefObject } from "react"

import { useBackToClose, type BackToClose } from "@/shared/hooks/useBackToClose"

function BackGuard({
    onBack,
    controlRef,
}: {
    onBack: () => void
    controlRef: RefObject<BackToClose | null>
}) {
    const back = useBackToClose(onBack)

    useEffect(() => {
        controlRef.current = back
        return () => {
            controlRef.current = null
        }
    }, [back, controlRef])

    return null
}

export function useGuardedBack(
    onClose: () => void,
    /** Return true to refuse a back press and keep the overlay open. */
    intercept?: () => boolean
) {
    const controlRef = useRef<BackToClose | null>(null)
    const closingRef = useRef(false)
    const [epoch, setEpoch] = useState(0)

    const onBack = () => {
        if (closingRef.current) {
            closingRef.current = false
            onClose()
            return
        }
        if (intercept?.()) {
            setEpoch((current) => current + 1)
            return
        }
        onClose()
    }

    const close = () => {
        if (!controlRef.current) {
            onClose()
            return
        }
        closingRef.current = true
        controlRef.current.requestClose()
    }

    return {
        /** Render this before anything that can stack on top of the overlay. */
        guard: <BackGuard key={epoch} onBack={onBack} controlRef={controlRef} />,
        close,
    }
}
