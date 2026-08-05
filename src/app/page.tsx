export const dynamic = "force-dynamic"

// Landing is always dark (dark hero photo) → dark status bar in every mode.
export const viewport = {
  themeColor: "#000000",
};

import styles from "./page.module.css";
import LandingPage from "@/features/landing/LandingPage";
import LandingGate from "@/features/landing/LandingGate";

export default function Home() {
  return (
    <div className={styles.page}>
      <LandingGate>
        <LandingPage />
      </LandingGate>
    </div>
  );
}