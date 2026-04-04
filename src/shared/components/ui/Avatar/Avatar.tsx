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
        <img src={src} alt={alt} className={styles.avatarImg} />
      ) : (
        <span aria-label={alt}>{initials}</span>
      )}
      {online && <span className={styles.avatarBadge} aria-label="Online" />}
    </span>
  );
}
