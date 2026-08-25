export const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbx1HrLB57lHlOScYAdixOXayHAZw3o6uvf5JC0UTvjKODFv5NEY2JPWHmSIK2R7nMfAvg/exec";

/**
 * The wordmark, served from /public rather than a media CDN.
 *
 * It is app chrome, not user media: it ships with the bundle, is needed on the
 * very first paint of the auth and landing pages, and must not depend on the
 * media domain being reachable. The SVG carries `fill="currentColor"`, which
 * resolves to black inside an <img> — the same black mark the previous hosted
 * PNG rendered.
 */
export const LOGO_URL = "/brand/goatza-logo.svg";

/**
 * Cover / banner aspect ratio (width ÷ height) for user + org profiles.
 * The crop editors (PhotoEditModal / OrgPhotoEditModal) and the display
 * containers (`.coverWrap { aspect-ratio: 3 / 1 }`) MUST use this same value,
 * so what the user crops is exactly what renders on the profile.
 */
export const COVER_ASPECT_RATIO = 3;