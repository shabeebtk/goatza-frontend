// @vitest-environment jsdom
/**
 * The bubble's progress label: Uploading N% → Processing… (the server is
 * converting the original — no count to give) → sent. Same for photos.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ChatMessage } from "../../hooks/useChatSocket"
import ImageMessage from "../ImageMessage/ImageMessage"
import VideoMessage from "./VideoMessage"

const bubble = (over: Partial<ChatMessage>): ChatMessage => ({
    id: "vid_1",
    content: "",
    sender_id: "user-1",
    created_at: new Date().toISOString(),
    message_type: "video",
    media_url: "",
    pending: true,
    uploadProgress: 40,
    ...over,
})

afterEach(cleanup)

describe("VideoMessage", () => {
    it("counts while the bytes move", () => {
        render(<VideoMessage msg={bubble({})} isMine showTime={false} timeLabel="" />)
        expect(screen.getByText("Uploading 40%")).toBeTruthy()
    })

    it("says Processing… while the server converts it", () => {
        render(
            <VideoMessage
                msg={bubble({ processing: true, uploadProgress: 100 })}
                isMine
                showTime={false}
                timeLabel=""
            />
        )
        expect(screen.getByText("Processing…")).toBeTruthy()
        expect(screen.queryByText(/%/)).toBeNull()
    })
})

describe("ImageMessage", () => {
    it("says Processing… while the server converts it", () => {
        render(
            <ImageMessage
                msg={bubble({ id: "img_1", message_type: "image", processing: true })}
                isMine
                showTime={false}
                timeLabel=""
            />
        )
        expect(screen.getByText("Processing…")).toBeTruthy()
    })
})
