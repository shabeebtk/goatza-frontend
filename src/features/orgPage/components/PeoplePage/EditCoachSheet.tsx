"use client"

import type { Coach } from "../../types"
import CoachFormSheet from "./CoachFormSheet"

/**
 * One coach's details, Save and "Remove from page". The same sheet as adding a
 * coach who isn't on Goatza; a member's name and photo stay their profile's.
 */
export default function EditCoachSheet({
  orgId,
  coach,
  onClose,
}: {
  orgId: string
  coach: Coach
  onClose: () => void
}) {
  return <CoachFormSheet orgId={orgId} coach={coach} onClose={onClose} />
}
