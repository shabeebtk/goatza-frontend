# Stage 5 — in-browser video encoding, and video flows back on

R2 does no transcoding, so the browser now produces the file every viewer will
get: H.264/MP4, ≤1280 on the longest side, ~2 Mbps, AAC audio preserved,
faststart, rotation baked in. All three video flows are re-enabled on top of it.

Nothing is committed.

---

## Library: mediabunny (1.55.2)

Chosen over `@remotion/webcodecs`. Both are WebCodecs-based and both mux MP4
in-browser, so the deciding factors were:

| | mediabunny | @remotion/webcodecs |
|---|---|---|
| License | **MPL-2.0** — file-level copyleft, covers modifications to *its* files, leaves our source unaffected as a dependency | **Remotion License** — requires a paid company licence above a small headcount |
| Runtime deps | none (two `@types/*` only) | `@remotion/media-parser`, tied to the Remotion release train |
| MP4 + faststart | `Mp4OutputFormat({ fastStart: 'in-memory' })` — **verified**, moov before mdat | yes |
| Bundle | pure ESM, tree-shakeable, and loaded via `await import()` inside the encode call — a user who never posts a video never downloads it | similar |

Licensing decided it. A media helper should not quietly commit the product to a
commercial licence agreement.

**ffmpeg.wasm was not added**, as instructed — and it would have been the wrong
tool anyway: a ~30MB wasm payload downloaded before the first byte of a phone
upload, running single-threaded, is worst on exactly the mid-range Android
devices this exists to serve.

Browser support: WebCodecs `VideoEncoder` is Chrome/Edge 94+, Safari 16.4+,
Firefox 130+. Anything older takes the failure path.

---

## Measured on the dev machine

13th Gen Intel Core i5-13420H · 16GB · Chrome 151 headless (ANGLE), driven
through a real browser harness against the actual `videoEncode.ts`:

| | |
|---|---|
| **30s 1080p H.264 clip → encode** | **~3.9 s** (3907 ms; 4040 ms on a second run) |
| Output | 7.98 MB from a 22.2 MB source, 1280×720, duration 30s |
| Faststart | ✅ moov before mdat in the first 4KB |
| Fast path (compliant 720p mp4 back in) | **3–4 ms**, `wasReencoded: false`, byte-identical |
| Poster "feed" | WebP, 1280×720, 14 KB |
| Poster "highlight" | WebP, **360×640**, 4 KB |
| `.mov` (video/quicktime) | rejected with the exact `VIDEO_UNSUPPORTED_MESSAGE` |
| Undecodable `.mp4` | passed through, `wasReencoded: false` |
| Abort mid-encode | throws `upload_cancelled` at **403 ms** (aborted at 400 ms — it unwinds, it does not finish the encode) |
| Abort before start | throws `upload_cancelled` immediately |

A phone will be several times slower than this — the 70/30 progress split exists
because on a mid-range Android the encode is the longer half.

---

## Files

### Created

| File | What |
|---|---|
| `src/shared/services/videoEncode.ts` | `encodeVideo` · `capturePoster` · `videoProgressSplit` · `fitWithin` · `canEncodeInBrowser` |
| `STAGE5_NOTES.md` | This file |

### Modified

| File | What |
|---|---|
| `package.json` | + `mediabunny@^1.55.2` |
| `features/posts/services/postUpload.service.ts` | Video branch re-enabled (`uploadPostVideo`); caps split raw/post-encode; exports `describeVideo` |
| `features/posts/components/CreatePostModal/CreatePostModal.tsx` | `optimizing` per entry → "Optimizing video…" label; dead `<Toaster />` removed |
| `features/highlights/services/highlightUpload.service.ts` | Cloudinary XHR uploader replaced with encode → poster → presigned PUTs; caps split; second duration gate |
| `features/highlights/hooks/useHighlightUpload.ts` | `optimizing` in state; phase-aware progress |
| `features/highlights/components/AddHighlightModal/AddHighlightModal.tsx` | "Optimizing video…" status label; `<Toaster />` comment corrected (it stays — highlights genuinely use sonner) |
| `features/messages/services/chatUpload.service.ts` | `uploadChatVideo` re-enabled; caps split |
| `features/messages/hooks/useChatImageUpload.ts` | Sends `thumbnail_url`; phase-aware progress; surfaces the unsupported-format error |
| `features/messages/hooks/useChatSocket.ts` | `optimizing` on the optimistic message type |
| `features/messages/components/VideoMessage/VideoMessage.tsx` | Bubble shows "Optimizing video…" during encode |
| `features/messages/components/ChatWindow/ChatWindow.tsx` | Dead `<Toaster />` removed |
| `src/shared/services/mediaUpload.ts` | `VIDEO_UPLOADS_ENABLED` / `VIDEO_DISABLED_MESSAGE` deleted — nothing checks them now |

No `TODO(video-stage)` markers remain in `src/`.

---

## Size caps: raw input vs post-encode

The old `MAX_VIDEO_MB` values gated the **picked file**. They now gate the
**encoder output**, with a separate, generous raw ceiling in front:

| Flow | Post-encode cap (= server POLICY) | Raw-input ceiling |
|---|---|---|
| Post video | 80 MB | 300 MB |
| Highlight | 40 MB | 300 MB |
| Chat video | 80 MB | 300 MB |

Why the gap: a 90s 4K iPhone clip is ~200MB and encodes to well under 40MB, so
gating the *pick* at the post-encode number would refuse videos the app handles
perfectly. The raw ceiling only stops someone waiting on a 2GB file. User-facing
messages now quote the raw ceiling, because that is the number that decides
whether a pick is accepted.

---

## Progress and labels

Identical in all three flows, via `videoProgressSplit`:

```
encode  → 0% .. 70%     label "Optimizing video…"
upload  → 70% .. 100%   label "Uploading"
```

Surfaced as `optimizing` on the post modal's entries, the highlight upload
state, and the chat optimistic message.

---

## Cleanup on abort

- `capturePoster` revokes its object URL and calls `video.load()` on **every**
  exit — success, error and timeout — so nothing holds a decoded buffer.
- `encodeVideo` disposes the mediabunny `Input` in a `finally`, releasing the
  reader and any decoder it still holds. Without it every aborted attempt leaked
  a WebCodecs decoder.
- Abort during encode calls `conversion.cancel()`, which makes the in-flight
  `execute()` reject — **measured at 403 ms for a 400 ms abort**, i.e. it unwinds
  rather than finishing the encode first.
- The abort listener is removed in the same `finally`.
- All three flows already delete their job/bubble before aborting, and the chat
  hook now returns early on the cancel sentinel instead of painting a failed
  bubble the user did not cause.

---

## Ambiguities resolved

**1. The poster is captured from the ENCODED blob, not the original.**
A raw HEVC `.mov` is exactly the file a `<video>` element may refuse to open, so
capturing from it would fail on the clips that most need a poster. The encoded
blob is always H.264/MP4, so a frame can always be decoded out of it. The one
cost is that the poster is taken after downscaling — invisible at 360×640.

**2. Highlights got a second duration gate.**
The pick-time `checkHighlightDuration` can return no metadata when a phone's
`<video>` probe times out, and (from Stage 2) the server *clamps* an
out-of-range duration to NULL rather than rejecting it. So a 4-minute clip could
have reached the rail with no duration. `uploadHighlightVideo` now re-checks the
encoder's measured duration before uploading, using the existing
`tooLongMessage`.

**3. Highlights still sign under the `posts` upload type.**
Unchanged from before this stage — the backend has no `highlights` type, and
clips land in the player's own user-scoped folder. Not something to change while
re-enabling video.

**4. `.mov` stays an accepted INPUT.**
`VIDEO_EXTENSIONS` and `VIDEO_ACCEPT` are untouched: a `.mov` is now encoded to
H.264/MP4 before upload, which is the point. What must never happen is a `.mov`
being *stored*, and `PASSTHROUGH_CONTENT_TYPES` deliberately excludes
`video/quicktime` so no branch — including the failure path — can upload one.
Verified.

**5. Chat needed an error message, not just a failed bubble.**
The failure path is only actionable if the user is told *why*. Posts show the
error inline and highlights toast it, but chat only marked the bubble failed.
It now raises the message through `useToast` — the app's real, globally mounted
toast system — for the unsupported-format case specifically.

**6. Two `<Toaster />` mounts from Stage 3 were removed.**
They existed solely to show the video-disabled notice. With that gone, nothing
on `CreatePostModal` or `ChatWindow` raises a sonner toast, so they were dead
mounts. `AddHighlightModal` keeps its one: `useHighlightUpload` reports every
failure through sonner, and without a `<Toaster />` those are silent no-ops.

**7. Encoder output can still overshoot the cap.**
A long, highly detailed clip at a fixed bitrate can land above `maxBytes`. That
throws a clear "Encoded video is NMB, over the NMB limit" rather than being
uploaded to a server 400.

---

## MANUAL DEVICE TEST PLAN

Automated verification above covers desktop Chrome, the fast path, the failure
path and the 9:16 poster. **These four must still be run by hand** — real phone
hardware is the thing a headless desktop browser cannot stand in for.

### 1. Real iPhone HEVC `.mov`, portrait AND landscape — the critical test

Record four clips on an iPhone (Settings → Camera → Formats → **High
Efficiency**, so they are genuinely HEVC): portrait ~15s, landscape ~15s, one of
each at 4K if the device allows.

Upload each as a **post**, from:
- **Android Chrome** (ideally a mid-range device, not a flagship)
- **iPhone Safari**

For every combination, verify on **all three** of Android Chrome, iPhone Safari
and desktop:

- [ ] The clip plays at all (this is the failure the stage exists to prevent)
- [ ] **Rotation is correct** — a portrait clip is upright, not sideways and not
      letterboxed into landscape. Rotation is baked into the frames
      (`allowRotationMetadata: false`) precisely because Android Chrome and
      several in-app browsers ignore rotation metadata
- [ ] **Seek works** — scrub to the middle and to the end; playback resumes from
      the scrub point (this is what the 2s keyframe interval and faststart buy)
- [ ] Audio is present and in sync
- [ ] The feed poster matches the first frame and does not pop/resize when the
      video starts
- [ ] "Optimizing video…" appears during the encode and the bar moves 0→70%,
      then "Uploading" 70→100%

Repeat at least once each for a **highlight** and a **chat video**.

### 2. Fast path — already-compliant 720p mp4

Take a 720p H.264 `.mp4` already under the cap (the output of test 1 works).
- [ ] Upload is **near-instant** — no "Optimizing video…" phase worth seeing
- [ ] File is byte-identical to what was picked (`wasReencoded: false`)
- [ ] Confirm in devtools that the bytes went straight to the PUT

### 3. Failure path — a browser without WebCodecs

Use a browser where `VideoEncoder` is undefined (an older Firefox, or run
`Object.defineProperty(window,'VideoEncoder',{value:undefined})` in the console
before picking).
- [ ] An **`.mp4`** uploads unchanged (safe container, passthrough)
- [ ] A **`.mov`** is refused with exactly:
      *"This video format isn't supported on this device — try a shorter clip or
      a different file."*
- [ ] Confirm in the network tab that **no upload-config request was made** for
      the `.mov` — it must fail before any network call
- [ ] The message is visible on all three surfaces (post inline, highlight
      toast, chat toast)

### 4. Highlight poster is true 9:16

- [ ] Upload a **landscape** clip as a highlight
- [ ] The rail tile is 360×640 and **cover-cropped**, not letterboxed — the
      centre of the frame fills the tile, matching the old
      `so_0,c_fill,w_360,h_640` behaviour
- [ ] The tile is not stretched

### Also worth checking on a phone

- [ ] Cancel mid-encode: the bubble/tile disappears, no stuck progress, and the
      tab does not keep burning CPU
- [ ] Background the app mid-encode and return — iOS Safari throttles hard, so
      confirm it either completes or fails cleanly rather than hanging
- [ ] Encode time on the slowest target device — if a 30s clip takes over ~60s
      there, consider dropping `MAX_VIDEO_DIMENSION` to 960 for a large win

---

## Not in this stage

- No tests written or updated. Several existing tests assert the old
  Cloudinary upload behaviour and will fail — expected, and owned by the final
  testing stage.
- HLS/adaptive streaming stays parked (`hlsSrc()` returns `""` from Stage 4).
- The verification harness was built in the scratchpad, outside the repo, and
  removed afterwards.
