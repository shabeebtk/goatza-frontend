"use client";
/**
 * LandingImage — next/image (fill) with a graceful fallback.
 * If the source fails to load, renders a brand gradient (+ optional icon)
 * so a missing asset never shows a broken image. Warns in dev only.
 */
import { useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import styles from "../LandingPage.module.css";

interface LandingImageProps {
  src: string;
  /** Meaningful text for content images; "" for decorative backgrounds. */
  alt: string;
  sizes: string;
  priority?: boolean;
  quality?: number;
  /** Applied to the underlying <img> (object-fit, ken-burns target, etc.). */
  className?: string;
  /** Iconify name shown inside the fallback gradient. */
  fallbackIcon?: string;
  /** Pixel size of the fallback icon (default 56; use smaller for thumbnails). */
  fallbackIconSize?: number;
}

export default function LandingImage({
  src,
  alt,
  sizes,
  priority = false,
  quality = 80,
  className,
  fallbackIcon,
  fallbackIconSize = 56,
}: LandingImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={styles.imgFallback}
        aria-hidden={alt === "" ? true : undefined}
        role={alt === "" ? undefined : "img"}
        aria-label={alt === "" ? undefined : alt}
      >
        {fallbackIcon && (
          <Icon icon={fallbackIcon} width={fallbackIconSize} height={fallbackIconSize} aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={quality}
      className={className}
      onError={() => {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(`[landing] image failed to load, using fallback: ${src}`);
        }
        setErrored(true);
      }}
    />
  );
}
