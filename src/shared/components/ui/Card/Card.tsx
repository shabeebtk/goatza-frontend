import clsx from "clsx";
import styles from "./Card.module.css";


interface CardProps {
  children: React.ReactNode;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  as?: "div" | "article" | "section" | "li";
}
 
export default function Card({
  children,
  interactive = false,
  onClick,
  className = "",
  as: Tag = "div",
}: CardProps) {
  return (
    <Tag
      className={`${styles.card} ${interactive ? styles.cardInteractive : ""} ${className}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {children}
    </Tag>
  );
}
 