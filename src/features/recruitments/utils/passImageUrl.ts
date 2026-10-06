/**
 * Where the trial-pass image lives.
 *
 * Deliberately NOT under `/api/`, for the same reason the profile card is not:
 * `vercel.json` rewrites every `/api/:path*` request straight to Django, so a
 * Next route handler under that prefix is unreachable in production while
 * working perfectly in `next dev`, which is the worst way for it to break.
 *
 * NOT WORLD-READABLE BY ID, unlike the profile card. A pass names one player,
 * their age group and whether they have paid; the route checks the caller is
 * the applicant and 404s otherwise, matching the API's ownership behaviour.
 *
 * That has a consequence worth knowing: the browser sends no Authorization
 * header on an `<img src>`, so this URL CANNOT be used as one. The caller
 * fetches it with the access token and turns the blob into a download — see
 * TrialPass.tsx.
 */

export const PASS_ROUTE = "/card/pass"

export function passImageUrl(applicationId: string, origin?: string): string {
    const path = `${PASS_ROUTE}/${applicationId}`
    return origin ? `${origin.replace(/\/+$/, "")}${path}` : path
}
