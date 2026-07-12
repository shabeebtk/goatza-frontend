"use client"

import { useId, useMemo } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import type { TrendPoint } from "../../services/dashboard.api"
import styles from "./TrendChart.module.css"

// Fixed coordinate space; the SVG scales to its container width. Strokes use
// vector-effect: non-scaling-stroke so they stay crisp at any width.
const VIEW_W = 100
const VIEW_H = 100
const PAD_Y = 10

interface TrendChartProps {
  title: string
  icon: string
  accent: string // any CSS color, e.g. "var(--color-brand)"
  points: TrendPoint[]
}

export default function TrendChart({
  title,
  icon,
  accent,
  points,
}: TrendChartProps) {
  const gradientId = useId()

  const { linePath, areaPath, total, peak } = useMemo(() => {
    const counts = points.map((p) => p.count)
    const total = counts.reduce((sum, c) => sum + c, 0)
    const peak = Math.max(...counts, 1)
    const n = points.length

    const coords = points.map((p, i) => {
      const x = n <= 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W
      const usable = VIEW_H - PAD_Y * 2
      const y = PAD_Y + (1 - p.count / peak) * usable
      return { x, y }
    })

    if (!coords.length) {
      return { linePath: "", areaPath: "", total: 0, peak: 0 }
    }

    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ")

    const areaPath =
      `M${coords[0].x.toFixed(2)} ${VIEW_H} ` +
      coords
        .map((c) => `L${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
        .join(" ") +
      ` L${coords[coords.length - 1].x.toFixed(2)} ${VIEW_H} Z`

    return { linePath, areaPath, total, peak }
  }, [points])

  const firstDate = points[0]?.date
  const midDate = points[Math.floor(points.length / 2)]?.date
  const lastDate = points[points.length - 1]?.date

  return (
    <div className={styles.chart}>
      <div className={styles.head}>
        <span className={styles.titleWrap}>
          <span className={styles.iconDot} style={{ color: accent }}>
            <Icon icon={icon} width={16} height={16} />
          </span>
          <span className={styles.title}>{title}</span>
        </span>
        <span className={styles.total}>
          {total}
          <span className={styles.totalLabel}>this period</span>
        </span>
      </div>

      <div className={styles.plot}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}: ${total} over the period, peak ${peak} per day`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className={styles.axis}>
        <span>{firstDate ? dayjs(firstDate).format("MMM D") : ""}</span>
        <span>{midDate ? dayjs(midDate).format("MMM D") : ""}</span>
        <span>{lastDate ? dayjs(lastDate).format("MMM D") : ""}</span>
      </div>
    </div>
  )
}
