// @vitest-environment jsdom
/**
 * The profile with the org's page: sections in the page's order (academy and
 * club), a switched-off or empty section leaves nothing behind, Sports follows
 * the about slot, trials hide for visitors when empty, the owner's view, the
 * contact row, the desktop aside, the signed-in skeleton, and the profile as it
 * always was when there is no page.
 */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE, CLUB_PAGE, LOCATIONS } from "@/features/orgPage/__fixtures__/pageShowcase"
import sectionStyles from "@/features/orgPage/components/profile/ProfileSection.module.css"
import type { PageShowcase } from "@/features/orgPage/types"
import { useAuthStore } from "@/store/auth.store"
import OrgProfile from "./OrganizationProfile"

const mocks = vi.hoisted(() => ({
  org: null as unknown,
  page: { data: undefined, isLoading: false } as { data?: unknown; isLoading?: boolean; isError?: boolean },
  squads: 0,
  trials: 0,
}))

vi.mock("@iconify/react", () => ({ Icon: ({ icon }: { icon: string }) => <span data-icon={icon} /> }))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/organization/profile/kannurfa",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/shared/services/navigation.service", () => ({
  useNavigation: () => ({ toMessage: () => "/m", toNetwork: () => "/n", toProfile: (u: string) => `/p/${u}` }),
}))
vi.mock("@/features/profile/context/PublicProfileContext", () => ({ usePublicProfile: () => null }))
vi.mock("@/features/organization/hooks/useOrganizations", () => ({
  useOrgDetail: () => ({ data: mocks.org, isLoading: false, isError: false }),
  useFollowOrg: () => ({
    follow: { mutate: vi.fn(), isPending: false },
    unfollow: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock("@/features/orgPage/hooks/usePageShowcase", () => ({
  usePageShowcase: () => mocks.page,
  usePublicPageShowcase: () => ({ data: undefined }),
}))
vi.mock("@/features/orgPage/hooks/useProfilePresence", () => ({
  useShowcaseSquadCount: () => mocks.squads,
  useTrialCount: () => mocks.trials,
}))
vi.mock("@/features/profile/components/ProfileShareMenu/ProfileShareMenu", () => ({ default: () => null }))
vi.mock("@/features/moderation/components/BlockedProfileBanner/BlockedProfileBanner", () => ({ default: () => null }))
vi.mock("../OrgPhotoEditModal/OrgPhotoEditModal", () => ({ default: () => null }))
vi.mock("../EditOrgProfileModal/EditOrgProfileModal", () => ({ default: () => null }))
vi.mock("@/features/posts/components/CreatePostModal/CreatePostModal", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostsList/PostsList.tsx", () => ({ default: () => <div data-testid="posts" /> }))
vi.mock("@/features/squads/components/OrgSquadsSection/OrgSquadsSection", () => ({
  default: () => <div data-testid="squads" />,
}))
// An empty trials list: the owner's empty state, nothing when hidden.
vi.mock("@/features/recruitments/components/RecruitmentsList/RecruitmentsList", () => ({
  default: ({ hideWhenEmpty }: { hideWhenEmpty?: boolean }) => (hideWhenEmpty ? null : <p>No open trials</p>),
}))

const makeOrg = (overrides: Record<string, unknown> = {}) => ({
  id: "org-1",
  name: "Kannur FA",
  username: "kannurfa",
  type: "academy",
  level: "",
  logo: "",
  cover_image: "",
  headline: "",
  description: "We coach football in Kannur.",
  website: "",
  followers_count: 0,
  following_count: 0,
  posts_count: 0,
  is_verified: false,
  sports: [{ id: "s-1", name: "Football", icon_name: "", is_primary: true }],
  locations: LOCATIONS,
  relationship: { is_me: false, is_following: false, is_followed_by: false },
  ...overrides,
})

const showPage = (page: PageShowcase | null | undefined, extra: Partial<typeof mocks.page> = {}) => {
  mocks.page = { data: page, isLoading: false, ...extra }
}

const renderProfile = ({ isOwn = false, org = makeOrg() } = {}) => {
  mocks.org = org
  return render(<OrgProfile orgId="org-1" isOwn={isOwn} />)
}

/** The page's sections, in document order, by key. */
const sectionKeys = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[id^='page-']"))
    .map((element) => element.id)
    .filter((id) => /^page-[a-z]+$/.test(id))
    .map((id) => id.replace("page-", ""))

beforeEach(() => {
  mocks.squads = 2
  mocks.trials = 1
  showPage(ACADEMY_PAGE)
  useAuthStore.setState({ organizations: [{ id: "org-1", my_permissions: ["page.manage"] }] } as never)
})

afterEach(() => {
  cleanup()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe("the sections, in the page's order", () => {
  it("lays an academy out in its order, Sports after About and Posts last", () => {
    renderProfile()

    expect(sectionKeys()).toEqual([
      "about",
      "sports",
      "programs",
      "facilities",
      "coaches",
      "players",
      "squads",
      "locations",
      "trials",
      "posts",
    ])
    for (const title of ["About", "Programs & fees", "Facilities", "Coaches", "Players we developed", "Locations"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy()
    }
  })

  it("lays a club out in its order: squads and trials early, programs later", () => {
    showPage(CLUB_PAGE)
    renderProfile({ org: makeOrg({ name: "Thalassery United", username: "thalassery", type: "club" }) })

    expect(sectionKeys()).toEqual([
      "about",
      "sports",
      "squads",
      "trials",
      "coaches",
      "players",
      "programs",
      "locations",
      "posts",
    ])
  })

  it("leaves out a section the club switched off, whatever is in it", () => {
    showPage({
      ...ACADEMY_PAGE,
      order: ACADEMY_PAGE.order.filter((key) => key !== "coaches"),
      sections: { ...ACADEMY_PAGE.sections, coaches: false },
    })
    renderProfile()

    expect(sectionKeys()).not.toContain("coaches")
    expect(screen.queryByText("Meera Nair")).toBeNull()
  })

  it("skips a key this build doesn't know", () => {
    showPage({ ...ACADEMY_PAGE, order: ["about", "gallery", "programs", "posts"] })
    renderProfile()

    expect(sectionKeys()).toEqual(["about", "sports", "programs", "posts"])
  })

  it("draws nothing, divider included, for empty programs, facilities, coaches and players", () => {
    mocks.squads = 0
    mocks.trials = 0
    showPage({ ...ACADEMY_PAGE, programs: [], facilities: [], coaches: [], players: [] })
    renderProfile()

    expect(sectionKeys()).toEqual(["about", "sports", "locations", "posts"])
    // One divider each for the four that drew.
    expect(document.querySelectorAll(`.${sectionStyles.divider}`)).toHaveLength(4)
  })

  it("puts Sports first when About is switched off", () => {
    showPage({ ...ACADEMY_PAGE, order: ACADEMY_PAGE.order.filter((key) => key !== "about") })
    renderProfile()

    expect(sectionKeys().slice(0, 2)).toEqual(["sports", "programs"])
  })
})

describe("trials", () => {
  it("draws nothing for a visitor with none open", () => {
    mocks.trials = 0
    renderProfile()

    expect(sectionKeys()).not.toContain("trials")
    expect(screen.queryByText("No open trials")).toBeNull()
  })

  it("keeps the owner's empty state", () => {
    mocks.trials = 0
    renderProfile({ isOwn: true })

    expect(sectionKeys()).toContain("trials")
    expect(screen.getByText("No open trials")).toBeTruthy()
  })
})

describe("visitors and the owner", () => {
  it("gives a visitor the contact row above Follow", () => {
    renderProfile()

    const enquire = screen.getByRole("button", { name: "Enquire now with Kannur FA" })
    const follow = screen.getByRole("button", { name: "Follow" })
    expect(enquire.compareDocumentPosition(follow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("link", { name: "WhatsApp Kannur FA" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Manage your page" })).toBeNull()
  })

  it("makes WhatsApp the primary for a club with the form off", () => {
    showPage(CLUB_PAGE)
    renderProfile({ org: makeOrg({ name: "Thalassery United", username: "thalassery", type: "club" }) })

    expect(screen.queryByRole("button", { name: /Enquire now/ })).toBeNull()
    expect(screen.getByRole("link", { name: "WhatsApp Thalassery United" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Enquire about/ })).toBeNull()
  })

  it("gives the owner the same sections, Manage your page, and no contact actions", () => {
    renderProfile({ isOwn: true })

    expect(sectionKeys()).toContain("programs")
    expect(screen.getByRole("link", { name: "Manage your page" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/page"
    )
    expect(screen.queryByRole("button", { name: /Enquire now/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Enquire about/ })).toBeNull()
  })

  it("hides Manage your page without page.manage", () => {
    useAuthStore.setState({ organizations: [{ id: "org-1", my_permissions: [] }] } as never)
    renderProfile({ isOwn: true })

    expect(screen.queryByRole("link", { name: "Manage your page" })).toBeNull()
  })
})

describe("the desktop aside", () => {
  it("holds the CTA, the branches and the quick facts from 1024px, and the column drops them", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("min-width: 1024px") || query.includes("min-width: 768px"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    renderProfile()

    const aside = screen.getByRole("complementary", { name: "About joining Kannur FA" })
    expect(within(aside).getByRole("heading", { name: "Interested in joining?" })).toBeTruthy()
    expect(within(aside).getByRole("button", { name: "Enquire now with Kannur FA" })).toBeTruthy()
    expect(within(aside).getByRole("heading", { name: "Quick facts" })).toBeTruthy()
    expect(within(aside).getByRole("heading", { name: "Locations" })).toBeTruthy()
    // Not twice: the header row, Locations and the moved facts leave the column.
    expect(screen.getAllByRole("button", { name: "Enquire now with Kannur FA" })).toHaveLength(1)
    expect(screen.getAllByRole("heading", { name: "Locations" })).toHaveLength(1)
    expect(screen.getAllByText("Founded")).toHaveLength(1)
  })
})

describe("without the page", () => {
  it("shows light skeletons, and no section bar, while a signed-in read loads", () => {
    showPage(undefined, { isLoading: true })
    renderProfile()

    expect(screen.getByRole("status", { name: "Loading the page" })).toBeTruthy()
    expect(sectionKeys()).toEqual([])
    expect(screen.queryByRole("navigation", { name: "Page sections", hidden: true })).toBeNull()
  })

  it("is the profile as it always was when the page answers null or fails", () => {
    for (const state of [{ data: null }, { data: undefined, isError: true }]) {
      cleanup()
      mocks.page = { isLoading: false, ...state }
      renderProfile()

      expect(sectionKeys()).toEqual([])
      expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
        "About",
        "Sports",
        "Locations",
      ])
      expect(screen.getByText("No open trials")).toBeTruthy()
      expect(screen.queryByRole("button", { name: /Enquire/ })).toBeNull()
      expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull()
      expect(screen.queryByRole("status", { name: "Loading the page" })).toBeNull()
    }
  })
})
