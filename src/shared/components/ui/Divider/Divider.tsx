import clsx from "clsx";
import styles from "./Divider.module.css";
import React from "react";

interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export default function Divider({
  label,
  className,
  ...props
}: DividerProps) {
  return (
    <div
      className={clsx(styles.divider, className)}
      role="separator"
      {...props} 
    >
      <span className={styles.dividerLine} />
      {label && <span>{label}</span>}
      <span className={styles.dividerLine} />
    </div>
  );
}