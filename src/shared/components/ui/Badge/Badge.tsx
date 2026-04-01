import clsx from "clsx";
import styles from "./Badge.module.css";
import React, { forwardRef } from "react";


interface BadgeProps {
  variant?: "brand" | "default" | "success" | "error";
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}
 
export default function Badge({
  variant = "default",
  dot = false,
  children,
  className = "",
}: BadgeProps) {
  const variantMap: Record<string, string> = {
    brand:   styles.badgeBrand,
    default: styles.badgeDefault,
    success: styles.badgeSuccess,
    error:   styles.badgeError,
  };
 
  return (
    <span className={`${styles.badge} ${variantMap[variant]} ${className}`}>
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  );
}