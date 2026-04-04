import clsx from "clsx";
import styles from "./Input.module.css";
import React, { forwardRef, useState } from "react";
import { Icon } from "@iconify/react";

type Size = "sm" | "md" | "lg";

/* ── Base Props ───────────────────────────────────────────── */

type BaseProps = {
  label?: string;
  helperText?: string;
  error?: string;
  inputSize?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  required?: boolean;
  dark?: boolean;
};

/* ── Input Props ─────────────────────────────────────────── */

type InputOnlyProps = BaseProps &
  React.InputHTMLAttributes<HTMLInputElement> & {
    as?: "input";
  };

type TextareaOnlyProps = BaseProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea";
  };

type InputProps = InputOnlyProps | TextareaOnlyProps;

/* ── Component ───────────────────────────────────────────── */

const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>((props, ref) => {
  const {
    label,
    helperText,
    error,
    inputSize = "md",
    leftIcon,
    rightIcon,
    onRightIconClick,
    required,
    dark,
    className,
    id,
  } = props;

  const [showPw, setShowPw] = useState(false);

  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  const sizeMap: Record<Size, string> = {
    sm: styles.inputSm,
    md: "",
    lg: styles.inputLg,
  };

  const wrapClasses = clsx(styles.inputWrap, sizeMap[inputSize], {
    [styles.inputError]: !!error,
    [styles.inputDark]: dark,
  });

  const eyeIcon = showPw
    ? "mdi:eye-off-outline"
    : "mdi:eye-outline";

  /* ─────────────────────────────────────────────── */
  /* 🧠 TYPE NARROWING STARTS HERE */
  /* ─────────────────────────────────────────────── */

  const isTextarea = "as" in props && props.as === "textarea";
  /* ── INPUT MODE ─────────────────────────────── */

  if (!isTextarea) {
    const {
      type = "text",
      ...rest
    } = props as InputOnlyProps;

    const isPassword = type === "password";
    const resolvedType = isPassword
      ? showPw
        ? "text"
        : "password"
      : type;

    const showRightIcon = rightIcon || isPassword;

    const inputClasses = clsx(
      styles.input,
      {
        [styles.inputIconLeft]: !!leftIcon,
        [styles.inputIconRight]: showRightIcon,
      },
      className
    );

    return (
      <div className={wrapClasses}>
        {label && (
          <label htmlFor={inputId} className={styles.inputLabel}>
            {label}
            {required && (
              <span className={styles.inputRequired}>*</span>
            )}
          </label>
        )}

        <div className={styles.inputFieldWrap}>
          {leftIcon && (
            <span className={styles.inputAdornLeft}>
              {leftIcon}
            </span>
          )}

          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={inputId}
            type={resolvedType}
            className={inputClasses}
            aria-invalid={!!error}
            {...rest}
          />

          {isPassword ? (
            <button
              type="button"
              className={clsx(
                styles.inputAdornRight,
                styles.inputAdornRightClickable
              )}
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
            >
              <Icon icon={eyeIcon} width={18} height={18} />
            </button>
          ) : rightIcon ? (
            onRightIconClick ? (
              <button
                type="button"
                className={clsx(
                  styles.inputAdornRight,
                  styles.inputAdornRightClickable
                )}
                onClick={onRightIconClick}
                tabIndex={-1}
              >
                {rightIcon}
              </button>
            ) : (
              <span className={styles.inputAdornRight}>
                {rightIcon}
              </span>
            )
          ) : null}
        </div>

        {error && (
          <p className={styles.inputErrorMsg}>
            <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
            {error}
          </p>
        )}

        {helperText && !error && (
          <p className={styles.inputHelper}>{helperText}</p>
        )}
      </div>
    );
  }

  /* ── TEXTAREA MODE ───────────────────────────── */

  const textareaProps = props as TextareaOnlyProps;

  const inputClasses = clsx(
    styles.input,
    styles.textarea,
    className
  );

  return (
    <div className={wrapClasses}>
      {label && (
        <label htmlFor={inputId} className={styles.inputLabel}>
          {label}
          {required && (
            <span className={styles.inputRequired}>*</span>
          )}
        </label>
      )}

      <div className={styles.inputFieldWrap}>
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          id={inputId}
          className={inputClasses}
          aria-invalid={!!error}
          {...textareaProps}
        />
      </div>

      {error && (
        <p className={styles.inputErrorMsg}>
          <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className={styles.inputHelper}>{helperText}</p>
      )}
    </div>
  );
});

Input.displayName = "Input";

export default Input;