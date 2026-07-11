import clsx from "clsx";
import styles from "./Avatar.module.css";

interface AvatarProps {
  src?: string;
  alt?: string;
  initials?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}

export default function Avatar({
  src,
  alt = "",
  initials,
  size = "md",
  online = false,
  className = "",
}: AvatarProps) {
  const sizeMap: Record<string, string> = {
    xs: styles.avatarXs,
    sm: styles.avatarSm,
    md: styles.avatarMd,
    lg: styles.avatarLg,
    xl: styles.avatarXl,
  };

  return (
    <span className={`${styles.avatar} ${sizeMap[size]} ${className}`}>
      {src ? (
        // Lazy + async so avatars deep in long lists don't fetch/decode until
        // near the viewport (harmless for above-the-fold avatars — they're in
        // view, so the browser loads them immediately anyway).
        <img
          src={src}
          alt={alt}
          className={styles.avatarImg}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span aria-label={alt}>{initials}</span>
      )}
      {online && <span className={styles.avatarBadge} aria-label="Online" />}
    </span>
  );
}
