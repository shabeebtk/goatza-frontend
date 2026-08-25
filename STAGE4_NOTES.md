# Stage 4 — replace the delivery layer

The database now stores final, directly-playable URLs, so the ~285-line
transform-building layer became four field reads. `cloudinaryDelivery.ts` is
deleted; `mediaDelivery.ts` takes its place and does no string manipulation at
all.

Nothing is committed.

---

## Files

### Created

| File | What |
|---|---|
| `src/shared/services/mediaDelivery.ts` | `videoSrc` · `posterSrc` · `thumbSrc` · `hlsSrc` · `isLocalPreview` · `MediaLike` |
| `public/brand/goatza-logo.svg` | The logo, served locally (see ambiguity 4) |
| `.env.local.example` | Documents `NEXT_PUBLIC_MEDIA_BASE_URL` |
| `STAGE4_NOTES.md` | This file |

### Deleted

| File | Why |
|---|---|
| `src/shared/services/cloudinaryDelivery.ts` | The whole transform layer — `c_limit/q_auto/vc_h264/sp_hd/so_0` |
| `cloudinaryThumb()` in `chatUpload.service.ts` | A `/upload/` URL rewrite; list views read `thumbSrc` now |
| `highlightThumbnailUrl()` in `highlightUpload.service.ts` | Built a `so_0` poster URL — no R2 equivalent |
| `highlightVideoUrl()` in `highlightUpload.service.ts` | A one-line wrapper around `videoDeliveryUrl` |
| `withTransform()` + `TRANSFORM` in `ogImage.ts` | The `c_fill,g_face,b_auto` OG transform |

### Modified

| File | What |
|---|---|
| `features/posts/components/MediaCarousel` | Feed + lightbox video; feed images now load the thumb, lightbox keeps the full object |
| `features/posts/components/EditPostModal` | Preview video src + poster |
| `features/recruitments/components/RecruitmentDetail` | Video src + poster |
| `features/messages/components/VideoMessage` | Fullscreen src + poster, and the bubble poster |
| `features/messages/components/ImageMessage` | Bubble reads `thumbSrc` |
| `features/highlights/components/HighlightViewer` | Clip src, poster, next-clip warm-up + poster prefetch |
| `features/highlights/services/highlightUpload.service.ts` | Both URL builders removed; disabled upload body no longer fabricates a poster |
| `features/messages/services/chatUpload.service.ts` | `cloudinaryThumb` removed |
| `features/profile/utils/ogImage.ts` | Any absolute URL is now shareable |
| `next.config.ts` | Media host from env (build fails without it); Cloudinary pattern kept with `TODO(cleanup-stage)` |
| `src/constants.ts` | `LOGO_URL` → `/brand/goatza-logo.svg` |
| `src/shared/components/ToastDemoInner.tsx` | Two hardcoded Cloudinary avatars → `""` (see ambiguity 6) |
| `.env.example` | Documents the media origin; notes that the HLS flag is now inert |

`src/shared/hooks/useAdaptiveVideo.ts` — **not modified**, as instructed.

---

## Helper renames

The old helpers took a URL **string**; the new ones take the media **row**, so
the fallback order (`thumbnail_url` vs `media_thumbnail_url`) lives in one place
instead of at each call site.

| Old | New |
|---|---|
| `videoDeliveryUrl(url)` | `videoSrc(media)` |
| `videoPosterUrl(url)` | `posterSrc(media)` |
| `videoHlsUrl(url)` | `hlsSrc()` — no argument, always `""` |
| `cloudinaryThumb(url, 640)` | `thumbSrc(media, fallbackToFull = true)` |
| `highlightVideoUrl(url)` | `videoSrc(clip)` |
| `highlightThumbnailUrl(cloud, id)` | — (posters are uploaded objects now) |

Every importer was updated. One local rename was needed: `HighlightViewer` had
local consts named `videoSrc` / `hlsSrc` that collided with the imports — they
are now `clipSrc` / `clipHlsSrc`.

---

## Gates

```
grep -rn "cloudinaryDelivery"  (repo-wide, excl. node_modules/.next)  → 0 hits
grep -rn "res.cloudinary.com" src/  (excl. test files)                → 0 hits
grep -n  "res.cloudinary.com" next.config.ts                          → 1 (the TODO)
```

`tsc --noEmit` exits 0; `npm run build` compiles successfully.

The build's fail-fast was verified both ways rather than assumed — this also
proves Next loads `.env.local` before evaluating `next.config.ts`:

```
NEXT_PUBLIC_MEDIA_BASE_URL=  npx next build
  → Error: NEXT_PUBLIC_MEDIA_BASE_URL is not set. It is the public origin media
    is served from (production: …; local dev: your bucket's …r2.dev URL). …

NEXT_PUBLIC_MEDIA_BASE_URL=media.goatza.com  npx next build
  → Error: NEXT_PUBLIC_MEDIA_BASE_URL is not a valid absolute URL:
    "media.goatza.com". It must include the scheme, e.g. https://media.goatza.com
```

---

## Ambiguities resolved

Default throughout: **preserve current rendering behaviour**.

**1. `blob:` / `data:` passthrough is now structural, not conditional.**
The old layer preserved local previews by refusing to rewrite anything that
didn't look like a Cloudinary URL. The new helpers only ever read a field and
hand back what they found, so the guarantee holds by construction. It is stated
explicitly in the file header and backed by an exported `isLocalPreview()`, so
that if a transform is ever reintroduced here the requirement is already
written down. `VideoMessage`'s optimistic poster (a locally captured frame) and
both modals' previews depend on it.

**2. `thumbSrc` falls back to the full URL by default.**
Rows created before Stage 3 have no thumbnail object. `fallbackToFull = true`
means those load the full image exactly as they always did — identical to the
old `cloudinaryThumb`, which returned the input unchanged when it couldn't
rewrite it. The migration is invisible on old content.

**3. The feed carousel now loads thumbnails; the lightbox does not.**
`MediaCarousel` passed `item.file_url` straight to its feed `<img>` because the
old code had no image transform to apply there. Now that a 640px object exists,
the scrolling feed uses `thumbSrc(item)` and the lightbox keeps `file_url`. This
is a deliberate improvement rather than pure preservation — it is the reason the
thumbnails were uploaded in Stage 3 — and it degrades to the old behaviour
automatically on rows without one.

**4. The logo: reused the existing SVG rather than adding a PNG.**
The brief suggested `/public/brand/goatza-logo.png`. `public/goatza-logo.svg`
was already in the repo, is the same mark, and carries `fill="currentColor"` —
which inside an `<img>` resolves to black, exactly matching the
`goatza-logo-black.png` it replaces. So it was copied to
`public/brand/goatza-logo.svg` (the suggested path, vector extension) rather
than fabricating a raster file I could not reproduce faithfully. All six
`LOGO_URL` usages are `<img src>` with CSS sizing, so nothing else changes. The
original `public/goatza-logo.svg` is left in place — `src/app/[username]/page.tsx`
references that filename in a reserved-path list.

**5. `ogImage.ts`: any absolute http(s) URL, not a host allow-list.**
Replacing the `res.cloudinary.com` check with a media-domain check would have
reintroduced exactly the bug being removed — the dev `r2.dev` URL would fail it,
and so would every legacy Cloudinary logo. The value comes from our own API, so
the only real requirement is that a scraper can fetch it: absolute, http(s).
Relative paths still fall through to the branded fallback icon, because an OG
tag that isn't absolute is silently ignored.

Consequence worth naming: an org's logo is now shared at its natural size and
aspect ratio instead of being cropped to 1200×630 by `c_fill,g_face`. Every
platform crops the image it is given to its own preview shape, so this is a
sizing change, not a broken card. The `OG_IMAGE_WIDTH/HEIGHT` constants are
unchanged and still exported — three route files use them for the `og:image`
dimension hints.

**6. Two hardcoded Cloudinary URLs outside the brief's list.**
`ToastDemoInner.tsx` pinned one real user's profile photo as a demo avatar,
twice. It is not a test file, so the gate covers it. Set to `""` — the Toast
component already falls back to `avatarInitials`, which is what a demo should
have used anyway. The file is not imported anywhere.

**7. `NEXT_PUBLIC_ENABLE_HLS` left in place but now inert.**
`hlsSrc()` returns `""` unconditionally, so the flag no longer does anything.
Removing it would touch `.env` files across environments for no behavioural
gain, so it stays with a comment in `.env.example` saying it is inert and why.

**8. `.env.local.example` is covered by `.gitignore`.**
`.gitignore` has a blanket `.env*`, so the new file will not be picked up by
`git add` without `-f` — the same situation the existing `.env.example` is in.
The var is therefore documented in **both** files, so whichever one is actually
tracked carries it. Worth a one-line `!.env*.example` negation in `.gitignore`
if you want them tracked, but that is a repo-hygiene change outside this stage.

---

## Not in this stage

- `useAdaptiveVideo.ts` untouched. Every caller now passes an empty `hlsSrc`, so
  it returns before importing hls.js and uses its mp4 path — no manifest
  request, no library download.
- Video posters are still empty on video rows (`posterSrc` returns `""`), which
  is correct until the client-side encoder uploads them.
- `res.cloudinary.com` stays in `next.config.ts` behind `TODO(cleanup-stage)`:
  pre-migration rows still point there, and dropping the pattern would break
  every one of those images.
- No tests written or updated. Several existing tests assert the old transform
  URLs and will fail — expected, and owned by the final testing stage.
