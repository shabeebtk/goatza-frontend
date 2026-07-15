export const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbx1HrLB57lHlOScYAdixOXayHAZw3o6uvf5JC0UTvjKODFv5NEY2JPWHmSIK2R7nMfAvg/exec";

export const LOGO_URL =
  "https://res.cloudinary.com/duotwo8gf/image/upload/v1774332703/goatza-logo-black_ve34f5.png";

/**
 * Cover / banner aspect ratio (width ÷ height) for user + org profiles.
 * The crop editors (PhotoEditModal / OrgPhotoEditModal) and the display
 * containers (`.coverWrap { aspect-ratio: 3 / 1 }`) MUST use this same value,
 * so what the user crops is exactly what renders on the profile.
 */
export const COVER_ASPECT_RATIO = 3;