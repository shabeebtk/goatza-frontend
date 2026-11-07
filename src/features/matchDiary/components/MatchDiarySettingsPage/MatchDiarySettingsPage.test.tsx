// @vitest-environment jsdom

/**
 * The one switch on this screen, and when it may be pressed.
 *
 * A save must not disable it, because that drops the focus of whoever just
 * pressed it. So what stops a double flip sending two requests is the handler.
 * The loading case is the other way round: there the switch only knows a guess,
 * and a tap on a guess could publish a season.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import MatchDiarySettingsPage from "./MatchDiarySettingsPage"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("@/shared/components/ui", () => ({
    BackHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

const settings = vi.fn()
const mutate = vi.fn()
let saving = false

vi.mock("../../hooks/useMatchDiary", () => ({
    useMatchDiarySettings: () => settings(),
    useUpdateMatchDiarySettings: () => ({ mutate, isPending: saving }),
}))

const loaded = () =>
    settings.mockReturnValue({
        data: { showcase_summary: false, longest_streak_weeks: 0 },
        isPending: false,
        error: null,
        refetch: vi.fn(),
    })

const theSwitch = () => screen.getByRole("switch") as HTMLButtonElement

afterEach(() => {
    cleanup()
    settings.mockReset()
    mutate.mockReset()
    saving = false
})

describe("the showcase switch", () => {
    it("is disabled while the settings are still loading", () => {
        settings.mockReturnValue({
            data: undefined,
            isPending: true,
            error: null,
            refetch: vi.fn(),
        })

        render(<MatchDiarySettingsPage />)

        expect(theSwitch().disabled).toBe(true)
    })

    it("sends the flip once the settings are in", () => {
        loaded()

        render(<MatchDiarySettingsPage />)
        fireEvent.click(theSwitch())

        expect(mutate).toHaveBeenCalledTimes(1)
        expect(mutate).toHaveBeenCalledWith({ showcase_summary: true })
    })

    it("stays enabled while the save runs, so it keeps focus", () => {
        loaded()
        saving = true

        render(<MatchDiarySettingsPage />)

        expect(theSwitch().disabled).toBe(false)
    })

    it("ignores a second flip while the save runs", () => {
        loaded()
        saving = true

        render(<MatchDiarySettingsPage />)
        fireEvent.click(theSwitch())

        expect(mutate).not.toHaveBeenCalled()
    })
})
