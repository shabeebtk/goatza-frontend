# Stage 3 — shared upload plumbing + every image flow on R2

Uploads changed shape with the provider. Cloudinary took a signed multipart POST
and reported back where it put the file, how big it was and what size it was.
R2 takes a presigned PUT of raw bytes and answers with an empty 200 — the URL
and key are known *before* the upload, and everything Cloudinary used to measure
is now the client's job.

Every image flow is migrated. Every video flow is switched off behind one flag.
Nothing is committed.

---

## Files

### Created

| File | What |
|---|---|
| `src/shared/services/mediaUpload.ts` | Contract types, `getUploadConfigApi`, `putToR2`, the cancel sentinel, `withCacheBust`, and the video kill-switch |
| `src/shared/services/imageVariants.ts` | `makeThumb` (640px WebP, ≤1MB) + `getBlobDimensions` |
| `STAGE3_NOTES.md` | This file |

### Migrated (image flows)

| File | Notes |
|---|---|
| `features/profile/hooks/usePhotoUpload.ts` | `profile` / `cover`, single image |
| `features/organization/hooks/useOrgPhotoUpload.ts` | `organization_logo` / `organization_cover`, passes `org_id` |
| `features/organization/hooks/useOrganizations.ts` | **Not in the brief** — the logo upload during org *create*. Same `organization_logo` type, `org_id` passed explicitly |
| `features/achievements/hooks/useAchievementImageUpload.ts` | single image |
| `features/matchDiary/services/matchPhoto.service.ts` | single image (the hook above it was untouched — its contract did not change) |
| `features/messages/services/chatUpload.service.ts` | image branch: full + 640 thumb; Cloudinary XHR helper removed |
| `features/messages/hooks/useChatImageUpload.ts` | forwards `thumbnail_url` |
| `features/messages/services/conversations.api.ts` | `SendImageMessagePayload.thumbnail_url` |
| `features/messages/components/ImageMessage/ImageMessage.tsx` | bubble prefers the real thumb object |
| `features/posts/services/postUpload.service.ts` | image branch, one config request per post |
| `features/posts/services/posts.api.ts` | `PostMediaPayload` gains `width` / `height` / `size_bytes` |
| `features/recruitments/components/.../CreateRecruitmentModal.tsx` | **Not in the brief** — recruitment media is image-only; same batching as posts |

### Video disabled (temporary)

| File | Where |
|---|---|
| `features/posts/services/postUpload.service.ts` | top of `uploadMediaFile`, before the config request |
| `features/highlights/services/highlightUpload.service.ts` | top of `uploadHighlightVideo` |
| `features/messages/services/chatUpload.service.ts` | top of `uploadChatVideo` |

Each is marked `TODO(video-stage)`, guarded by `VIDEO_UPLOADS_ENABLED`, and
short-circuits **before any network call**. No surrounding code was deleted.

### Toaster mounts (see ambiguity 4)

`CreatePostModal.tsx`, `ChatWindow.tsx`, `AddHighlightModal.tsx`.

---

## One config request per post

The brief asked for it for posts; the same reasoning made it right for
recruitments, so both work this way.

`temp_post_id` names the folder that every object of a not-yet-created post
lands in, and **the server mints a fresh one per request**. Asking per file
would scatter a 10-image carousel across 10 folders, which:

- breaks the server's same-folder rule binding a thumbnail to its image
  (Stage 2's `validate_thumbnail`), so every attach would 400; and
- leaves nothing for the eventual cleanup sweep to delete by prefix.

So every blob is declared up front, images interleaved with their own thumbs,
and the response comes back in that exact order:

```
files:   [img0, thumb0, img1, thumb1, …]
uploads: [ e0 ,   e1  ,  e2 ,   e3  , …]     image i → 2i, thumb i → 2i+1
```

`order` still carries the position the user arranged, independent of upload
order. The full image owns the progress bar — the thumb is tens of KB and would
only make the bar jump backwards when it starts.

---

## Ambiguities resolved

**1. Two image flows the brief did not list.**
`useOrganizations.ts` (logo on org create) and `CreateRecruitmentModal.tsx`
(recruitment media) were still calling `getUploadSignatureApi` +
`uploadToCloudinaryApi`. "Migrate EVERY image flow" covers them, and leaving
them would have left two flows uploading to a provider the backend no longer
validates against — an instant 400 on attach. Recruitment media is image-only
(`media_type` is hardcoded `"image"`), so it needed no video branch.

**2. Client-measured width/height, beyond "where the current code has them".**
Posts had no dimensions available — the old code read them off Cloudinary's
response. Stage 2 removed that server-side extraction, so *nothing* would supply
them and every new post would store NULL dimensions, leaving the feed with no
aspect ratio to reserve and a timeline that reflows as each image lands. So
`getBlobDimensions` measures them client-side for posts and chat. Best-effort by
design: it resolves to zeros rather than rejecting, so a browser that refuses to
decode can never fail an upload over a layout hint.

**3. The `?v=` cache-buster — the condition in the brief is currently false.**
Neither attach endpoint returns the stored URL (`/user/update/profile/cover` and
`/organizations/update/logo/cover` both answer with a message and no data), so
there is no server `?v=` to surface. But the optimistic cache write still needs
a URL the browser has not already painted, or a replaced avatar shows the old
image until a refetch. Both hooks therefore stamp `withCacheBust()` on the value
they put in the cache, and the org hook reads a URL out of the response *when
one is present* and prefers it — so the moment the backend starts returning one,
it is surfaced as-is with no further change. The attach payload always sends the
**bare** `public_url`; `?v=` is display-only and the server strips it anyway.

**4. "a sonner toast" — sonner has no global `<Toaster />`.**
The app has two toast systems: `ToastProvider` (`shared/components/ui/Toast`),
mounted globally in the root layout and used via `useToast`, and sonner, whose
`<Toaster />` is mounted **only** on `JoinPage`. Every other `toast.*` call in
the app — 19 files — is currently a silent no-op.

The brief specifies sonner, and the notice has to be raised inside the upload
*services*, which cannot call a hook. So sonner it is, with `<Toaster />` mounted
on the three surfaces that need it rather than globally: a global mount would
double-toast on JoinPage (which documents its own local one deliberately) and
would un-silence sonner across features this stage has no business changing.
Mounting on `AddHighlightModal` does un-silence that modal's own existing upload
toasts, which is a fix, not a regression.

**5. A typed flag instead of dead code after a `throw`.**
Short-circuiting with a bare `throw` at the top of `uploadHighlightVideo` made
TypeScript treat the rest of the body as unreachable, drop control-flow narrowing
inside it, and report two errors in code that is correct and only temporarily
switched off. `VIDEO_UPLOADS_ENABLED` is annotated `: boolean` rather than left
as the literal `false` for exactly this reason — the guarded bodies keep
typechecking, and flipping it to `true` is most of what re-enabling video takes.

**6. What the disabled paths throw.**
Posts and chat throw an `Error` carrying the message, which the existing UIs
already catch (inline submit error / a retryable failed bubble). Highlights
throws the **cancel sentinel** instead: `useHighlightUpload` treats a cancel as
silent, so the toast raised in the service is the only thing the user sees
rather than two stacked toasts saying the same thing.

**7. `UPLOAD_CANCELLED` is now one value.**
`chatUpload.service.ts` re-exports the shared sentinel rather than declaring its
own copy of `"upload_cancelled"`, so `putToR2`'s abort rejection and the chat
hook's cancel check are the same string. `highlightUpload.service.ts` re-exports
it from chat as it always did, so that chain is unchanged.

**8. Chat bubbles now prefer a real thumbnail object.**
`cloudinaryThumb()` was a URL transform; on an R2 URL it returns the input
unchanged. `ImageMessage` now reads `media_thumbnail_url` first and falls back to
`cloudinaryThumb(media_url)` — so new messages load the 640px object and messages
sent before this stage keep working exactly as they did. `cloudinaryThumb`
itself is untouched (delivery is a later stage's).

**9. `MediaUploadType` is declared in `shared/`, not imported from the feature.**
`upload.api.ts` keeps its own `UploadType` for the legacy Cloudinary functions
still used by the disabled highlights path. Duplicating the union is the smaller
cost than having `shared/` depend on `features/`. `"highlights"` is deliberately
absent from the new union — it is video-only.

---

## Not in this stage

- `cloudinaryDelivery.ts`, `useAdaptiveVideo`, `next.config.ts` and
  `src/constants.ts` were not touched — delivery is a later stage's.
- `upload.api.ts` still exports `getUploadSignatureApi` and
  `uploadToCloudinaryApi`. Only the disabled `uploadHighlightVideo` still calls
  them; both go when video is re-enabled.
- No tests written or updated. `tsc --noEmit` exits 0 and `npm run build`
  compiles successfully.
