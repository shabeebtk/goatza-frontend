export const dynamic = "force-dynamic"

import styles from "./page.module.css";
import LandingPage from "@/features/landing/LandingPage";

export default function Home() {
  return (
    <div className={styles.page}>
      <LandingPage />
    </div>
  );
}