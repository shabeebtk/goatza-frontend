import clsx from "clsx";
import React, { forwardRef, useState } from "react";
import styles from "./Button.module.css";
import Link from "next/link";

type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "brand" | "outline" | "ghost" | "danger";
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  as?: "button" | "a";
  href?: string;
}
 
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      iconOnly = false,
      leftIcon,
      rightIcon,
      children,
      className = "",
      disabled,
      as: Tag = "button",
      href,
      ...props
    },
    ref
  ) => {
    const variantMap: Record<string, string> = {
      primary: styles.btnPrimary,
      brand:   styles.btnBrand,
      outline: styles.btnOutline,
      ghost:   styles.btnGhost,
      danger:  styles.btnDanger,
    };
 
    const sizeMap: Record<string, string> = {
      sm: styles.btnSm,
      md: styles.btnMd,
      lg: styles.btnLg,
    };
 
    const classes = [
      styles.btn,
      variantMap[variant],
      sizeMap[size],
      fullWidth ? styles.btnFull : "",
      iconOnly  ? styles.btnIcon : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
 
    const content = (
      <>
        {loading && <span className={styles.btnSpinner} aria-hidden="true" />}
        {!loading && leftIcon && <span aria-hidden="true">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
      </>
    );

    if (href) {
      return (
        <Link href={href} className={classes}>
          {content}
        </Link>
      );
    }
 
    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = "Button";



export default Button