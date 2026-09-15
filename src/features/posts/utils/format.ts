/** 1234 → "1.2K". Below a thousand the number is shown as-is. */
export function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
