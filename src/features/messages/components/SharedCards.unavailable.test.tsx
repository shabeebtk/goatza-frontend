// @vitest-environment jsdom
/**
 * A chat card is whole or it says plainly that it is gone, and an ended trial's
 * card still opens the page that says so.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SharedRecruitmentPreview } from "../services/conversations.api"
import ChatActorAvatar from "./ChatActorAvatar/ChatActorAvatar"
import ImageMessage from "./ImageMessage/ImageMessage"
import MediaUnavailableTile from "./MediaUnavailableTile/MediaUnavailableTile"
import SharedPostMessage from "./SharedPostMessage/SharedPostMessage"
import SharedProfileMessage from "./SharedProfileMessage/SharedProfileMessage"
import SharedRecruitmentMessage from "./SharedRecruitmentMessage/SharedRecruitmentMessage"
import VideoMessage from "./VideoMessage/VideoMessage"
import type { ChatMessage } from "../hooks/useChatSocket"

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, "aria-label": label }: { icon: string; "aria-label"?: string }) => (
    <span data-icon={icon} aria-label={label} />
  ),
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("@/shared/services/navigation.service", () => ({
  useNavigation: () => ({
    toRecruitment: (id: string) => `/recruitments/${id}`,
    toProfile: (username: string) => `/${username}`,
  }),
}))
vi.mock("@/shared/components/ImageLightbox/MediaLightbox", () => ({ default: () => null }))
vi.mock("@/shared/hooks/useBodyScrollLock", () => ({ useBodyScrollLock: () => undefined }))

afterEach(cleanup)

const common = { isMine: false, showTime: false, timeLabel: "" }

const live = (
  overrides: Partial<Extract<SharedRecruitmentPreview, { unavailable: false }>> = {}
): SharedRecruitmentPreview => ({
  unavailable: false,
  id: "rec-1",
  title: "Open Trials",
  org: { id: "org-1", username: "dreamfc", name: "Dream FC", avatar: "", type: "organization" },
  sport: "Football",
  type: "open_trial",
  status: "active",
  deadline: "2999-01-01T00:00:00Z",
  cover_url: "",
  is_trial_over: false,
  is_accepting_applications: true,
  ...overrides,
})

const renderRecruitment = (preview: SharedRecruitmentPreview | null) =>
  render(<SharedRecruitmentMessage preview={preview} {...common} />)

describe("A shared recruitment", () => {
  it("that is live shows no tag and invites an application by date", () => {
    renderRecruitment(live())

    expect(screen.queryByText("Trial ended")).toBeNull()
    expect(screen.queryByText("Closed")).toBeNull()
    expect(screen.getByText(/Apply by/)).toBeTruthy()
  })

  it.each([[{ unavailable: true } as const], [null]])(
    "that is gone says so and cannot be tapped",
    (preview) => {
      renderRecruitment(preview)

      expect(screen.getByText("This recruitment is no longer available")).toBeTruthy()
      expect(screen.queryByRole("link")).toBeNull()
    }
  )

  it("whose trial ended is tagged, and still opens its page", () => {
    renderRecruitment(live({ is_trial_over: true }))

    expect(screen.getByText("Trial ended")).toBeTruthy()
    expect(screen.getByRole("link").getAttribute("href")).toBe("/recruitments/rec-1")
  })

  it("that closed is tagged", () => {
    renderRecruitment(live({ status: "closed", is_accepting_applications: false }))

    expect(screen.getByText("Closed")).toBeTruthy()
  })

  it("that stopped taking applications is tagged, though still active", () => {
    renderRecruitment(live({ is_accepting_applications: false }))

    expect(screen.getByText("Closed")).toBeTruthy()
  })

  it("that ended never invites an application", () => {
    for (const preview of [
      live({ is_trial_over: true }),
      live({ status: "closed" }),
      live({ is_accepting_applications: false }),
    ]) {
      const { unmount } = renderRecruitment(preview)

      expect(screen.queryByText(/Apply/)).toBeNull()

      unmount()
    }
  })

  it("from before the flags shipped reads as it did", () => {
    renderRecruitment(
      live({ is_trial_over: undefined, is_accepting_applications: undefined })
    )

    expect(screen.queryByText("Closed")).toBeNull()
    expect(screen.getByText(/Apply by/)).toBeTruthy()
  })
})

describe("A shared post", () => {
  it.each([[{ unavailable: true } as const], [null]])(
    "that is gone is one plain card, not tappable",
    (preview) => {
      render(<SharedPostMessage preview={preview} {...common} />)

      expect(screen.getByText("This post isn't available")).toBeTruthy()
      expect(screen.queryByRole("link")).toBeNull()
    }
  )
})

describe("A shared profile", () => {
  it.each(["user", "organization"] as const)(
    "of a %s that is gone is one plain card, not tappable",
    (kind) => {
      render(<SharedProfileMessage kind={kind} preview={{ unavailable: true }} {...common} />)

      expect(screen.getByText("This profile isn't available")).toBeTruthy()
      expect(screen.queryByRole("link")).toBeNull()
    }
  )
})

describe("A deleted account", () => {
  it("gets the default avatar, not initials from its placeholder name", () => {
    const { container } = render(
      <ChatActorAvatar actor={{ avatar: "", name: "Deleted account", username: "" }} />
    )

    expect(container.textContent).not.toContain("DE")
    expect(screen.getByLabelText("Deleted account")).toBeTruthy()
  })

  it("anybody else keeps their initials", () => {
    const { container } = render(
      <ChatActorAvatar actor={{ avatar: "", name: "Riya", username: "riya" }} />
    )

    expect(container.textContent).toContain("RI")
  })
})

const media = (overrides: Partial<ChatMessage> = {}) =>
  ({
    id: "m1",
    content: "",
    sender_id: "u2",
    created_at: "2026-01-01T00:00:00Z",
    message_type: "image",
    media_url: "https://cdn.test/full.jpg",
    media_thumbnail_url: "https://cdn.test/thumb.jpg",
    ...overrides,
  }) as ChatMessage

const TILE = "Media unavailable"

describe("A photo bubble", () => {
  it("shows the thumb", () => {
    const { container } = render(<ImageMessage msg={media()} {...common} />)

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/thumb.jpg"
    )
    expect(screen.queryByText(TILE)).toBeNull()
  })

  it("shows the tile when the server says it is gone, and offers no viewer", () => {
    const { container } = render(
      <ImageMessage
        msg={media({ media_unavailable: true, media_url: "", media_thumbnail_url: "" })}
        {...common}
      />
    )

    expect(screen.getByText(TILE)).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByRole("button", { name: "View photo" })).toBeNull()
  })

  it("falls back from the thumb to the full image, then to the tile", () => {
    const { container } = render(<ImageMessage msg={media()} {...common} />)

    fireEvent.error(container.querySelector("img")!)
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/full.jpg"
    )
    expect(screen.queryByText(TILE)).toBeNull()

    fireEvent.error(container.querySelector("img")!)
    expect(screen.getByText(TILE)).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
  })

  it("leaves a photo still uploading alone", () => {
    const { container } = render(
      <ImageMessage
        msg={media({ localPreviewUrl: "blob:x", pending: true, media_url: undefined })}
        {...common}
      />
    )

    fireEvent.error(container.querySelector("img")!)

    expect(screen.queryByText(TILE)).toBeNull()
    expect(container.querySelector("img")).toBeTruthy()
  })
})

describe("A video bubble", () => {
  const clip = (overrides: Partial<ChatMessage> = {}) =>
    media({
      message_type: "video",
      media_url: "https://cdn.test/clip.mp4",
      media_thumbnail_url: "https://cdn.test/poster.jpg",
      ...overrides,
    })

  it("shows the poster and can be played", () => {
    const { container } = render(<VideoMessage msg={clip()} {...common} />)

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/poster.jpg"
    )
    expect(screen.getByRole("button", { name: "Play video" })).toBeTruthy()
  })

  it("shows the tile when the server says it is gone, and cannot be played", () => {
    render(
      <VideoMessage
        msg={clip({ media_unavailable: true, media_url: "", media_thumbnail_url: "" })}
        {...common}
      />
    )

    expect(screen.getByText(TILE)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull()
  })

  it("keeps a clip playable when only the poster failed", () => {
    const { container } = render(<VideoMessage msg={clip()} {...common} />)

    fireEvent.error(container.querySelector("img")!)

    expect(screen.queryByText(TILE)).toBeNull()
    expect(screen.getByRole("button", { name: "Play video" })).toBeTruthy()
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      "https://cdn.test/clip.mp4"
    )
  })

  it("shows the tile when the clip itself will not load", () => {
    const { container } = render(<VideoMessage msg={clip()} {...common} />)

    fireEvent.error(container.querySelector("img")!)
    fireEvent.error(container.querySelector("video")!)

    expect(screen.getByText(TILE)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull()
  })

  it("does not probe a clip still uploading", () => {
    const { container } = render(
      <VideoMessage
        msg={clip({ media_url: undefined, media_thumbnail_url: undefined, pending: true })}
        {...common}
      />
    )

    expect(container.querySelector("video")).toBeNull()
    expect(screen.queryByText(TILE)).toBeNull()
  })
})

describe("MediaUnavailableTile", () => {
  it("says so in words, with no image", () => {
    const { container } = render(<MediaUnavailableTile />)

    expect(screen.getByText(TILE)).toBeTruthy()
    expect(container.querySelector("img")).toBeNull()
  })
})
