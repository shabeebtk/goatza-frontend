import clsx from "clsx";
import styles from "./Select.module.css";
import React, { forwardRef } from "react";
import { Icon } from "@iconify/react";

type Size = "sm" | "md" | "lg";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
 
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: string;
  size?: Size;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
}
 
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      size = "md",
      options,
      placeholder,
      required,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
 
    const sizeMap: Record<string, string> = {
      sm: styles.selectSm,
      md: "",
      lg: styles.selectLg,
    };
 
    const wrapClasses = [
      styles.selectWrap,
      error ? styles.selectError : "",
      sizeMap[size],
    ]
      .filter(Boolean)
      .join(" ");
 
    return (
      <div className={wrapClasses}>
        {label && (
          <label htmlFor={selectId} className={styles.inputLabel}>
            {label}
            {required && <span className={styles.inputRequired} aria-hidden="true">*</span>}
          </label>
        )}
        <div className={styles.selectFieldWrap}>
          <select
            ref={ref}
            id={selectId}
            className={`${styles.select} ${className}`}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className={styles.selectChevron} aria-hidden="true">
            <Icon icon="mdi:chevron-down" width={20} height={20} />
          </span>
        </div>
        {error && (
          <p className={styles.inputErrorMsg} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={12} height={12} aria-hidden="true" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className={styles.inputHelper}>{helperText}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";


export default Select