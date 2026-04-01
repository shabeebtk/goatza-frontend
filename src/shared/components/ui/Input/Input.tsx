import clsx from "clsx";
import styles from "./Input.module.css";
import React, { forwardRef, useState } from "react";
import { Icon } from "@iconify/react";

type Size = "sm" | "md" | "lg";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorText?: string;
  inputSize?: Size; 
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  required?: boolean;
  dark?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      errorText,
      inputSize = "md", 
      leftIcon,
      rightIcon,
      onRightIconClick,
      required,
      dark,
      className,
      id,
      type = "text",
      ...props
    },
    ref
  ) => {
    const [showPw, setShowPw] = useState(false);

    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const isPassword = type === "password";
    const resolvedType = isPassword ? (showPw ? "text" : "password") : type;

    const sizeMap: Record<Size, string> = {
      sm: styles.inputSm,
      md: "",
      lg: styles.inputLg,
    };

    const wrapClasses = clsx(
      styles.inputWrap,
      sizeMap[inputSize],
      {
        [styles.inputError]: !!errorText,
        [styles.inputDark]: dark,
      }
    );

    const inputClasses = clsx(
      styles.input,
      {
        [styles.inputIconLeft]: !!leftIcon,
        [styles.inputIconRight]: !!rightIcon || isPassword,
      },
      className
    );

    const eyeIcon = showPw ? "mdi:eye-off-outline" : "mdi:eye-outline";

    return (
      <div className={wrapClasses}>
        {label && (
          <label htmlFor={inputId} className={styles.inputLabel}>
            {label}
            {required && (
              <span className={styles.inputRequired} aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div className={styles.inputFieldWrap}>
          {leftIcon && (
            <span className={styles.inputAdornLeft} aria-hidden="true">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={inputClasses}
            aria-invalid={!!errorText}
            aria-describedby={
              errorText
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-helper`
                : undefined
            }
            {...props}
          />

          {isPassword ? (
            <button
              type="button"
              className={clsx(
                styles.inputAdornRight,
                styles.inputAdornRightClickable
              )}
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
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
                aria-label="Input action"
              >
                {rightIcon}
              </button>
            ) : (
              <span className={styles.inputAdornRight} aria-hidden="true">
                {rightIcon}
              </span>
            )
          ) : null}
        </div>

        {errorText && (
          <p
            id={`${inputId}-error`}
            className={styles.inputErrorMsg}
            role="alert"
          >
            <Icon
              icon="mdi:alert-circle-outline"
              width={12}
              height={12}
              aria-hidden="true"
            />
            {errorText}
          </p>
        )}

        {helperText && !errorText && (
          <p id={`${inputId}-helper`} className={styles.inputHelper}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;