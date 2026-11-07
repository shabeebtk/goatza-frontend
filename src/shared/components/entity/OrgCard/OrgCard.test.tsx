// @vitest-environment jsdom

/** The org's verified tick lives on its profile page. A card never carries one. */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import OrgCard, { type OrgCardData } from "./OrgCard"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}))

vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({ toProfile: () => "/org" }),
}))

afterEach(cleanup)

describe("OrgCard", () => {
    it("draws no tick, even for a verified organization", () => {
        // Extra field on purpose: the API keeps sending is_verified.
        const org = {
            username: "thalassery",
            name: "Thalassery United",
            is_verified: true,
        } as OrgCardData

        const { container } = render(<OrgCard org={org} />)

        expect(screen.getByText("Thalassery United")).toBeTruthy()
        expect(container.querySelector('[data-icon="mdi:check-decagram"]')).toBeNull()
        expect(screen.queryByLabelText("Verified")).toBeNull()
    })
})
