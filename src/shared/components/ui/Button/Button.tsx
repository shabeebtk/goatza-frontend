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
  /**
   * Link-only. `href` renders a next/link <a>, and these are the two props an
   * OUTBOUND link needs — a new tab, and severing the opener reference. Neither
   * exists on ButtonHTMLAttributes, so they are declared here rather than
   * arriving through the spread (which the href branch does not apply anyway).
   */
  target?: string;
  rel?: string;
  /**
   * Link-only. Present means "save this, do not navigate to it" — a string
   * sets the filename. Its presence also switches the anchor below away from
   * next/link; see there for why.
   */
  download?: boolean | string;
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
      target,
      rel,
      download,
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
        {!loading && leftIcon && (
          <span className={styles.btnIconWrap} aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children}
        {!loading && rightIcon && (
          <span className={styles.btnIconWrap} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </>
    );

    if (href) {
      // A download is a PLAIN anchor, never next/link. Link intercepts the
      // click to run a client-side navigation, and a client-side navigation
      // cannot produce a file — the browser would route to the URL instead of
      // saving it, so the button would silently do the wrong thing. Link's
      // own bail-outs (modifier keys, target != _self) do not include
      // `download`, so this has to be decided here.
      if (download !== undefined) {
        return (
          <a
            href={href}
            className={classes}
            download={download}
            target={target}
            rel={rel}
          >
            {content}
          </a>
        );
      }

      return (
        <Link href={href} className={classes} target={target} rel={rel}>
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
