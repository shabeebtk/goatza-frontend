/**
 * Status labels have to survive a value this build has never heard of.
 *
 * That is not hypothetical. `invited` and `rejected` were removed from the
 * choices, and a row written before the backfill still carries one — so a
 * client deployed AFTER the removal can be handed a status it does not know.
 * The failure mode being guarded against is a badge reading "undefined" on
 * somebody's own application.
 */

import { describe, expect, it } from "vitest"

import {
    playerStatusMeta,
    statusLabel,
    statusMeta,
} from "./applicationStatus"
import type { ApplicationStatus } from "./services/recruitments.api"

/** A value the union no longer contains, as the API can still send it. */
const LEGACY = "rejected" as ApplicationStatus
const UNKNOWN = "teleported" as ApplicationStatus

describe("statusLabel", () => {
    it("labels the statuses it knows", () => {
        expect(statusLabel("applied")).toBe("Applied")
        expect(statusLabel("not_selected")).toBe("Not selected")
    })

    it("varies trial_confirmed by recruitment type", () => {
        expect(statusLabel("trial_confirmed", "open_trial")).toBe(
            "Confirmed for trial",
        )
        expect(statusLabel("trial_confirmed", "player_looking")).toBe(
            "Invited to trial",
        )
        // No type, and an unknown one, both fall back rather than breaking.
        expect(statusLabel("trial_confirmed")).toBe("Confirmed for trial")
    })

    it("humanises a value it has never heard of", () => {
        // Never "undefined", and never a raw slug with an underscore in it.
        expect(statusLabel(LEGACY)).toBe("Rejected")
        expect(statusLabel(UNKNOWN)).toBe("Teleported")
        expect(statusLabel("" as ApplicationStatus)).toBe("—")
    })
})

describe("statusMeta", () => {
    it("always returns a renderable shape", () => {
        const meta = statusMeta(UNKNOWN)
        expect(meta.label).toBe("Teleported")
        // An icon and a colour class, so the badge renders rather than
        // collapsing to an empty element.
        expect(meta.icon).toBeTruthy()
        expect(meta.colorClass).toBeTruthy()
    })
})

describe("playerStatusMeta", () => {
    it("still softens a legacy `rejected` for the player", () => {
        // THE POINT OF KEEPING THAT OVERRIDE. A child reading their own
        // application sees "Not selected", in grey — never the word
        // "Rejected" — and removing the value from the union must not quietly
        // take that away.
        expect(playerStatusMeta(LEGACY).label).toBe("Not selected")
    })

    it("hides the org's private shortlist from the player", () => {
        expect(playerStatusMeta("shortlisted").label).toBe("Under review")
        expect(playerStatusMeta("reviewing").label).toBe("Under review")
    })
})

