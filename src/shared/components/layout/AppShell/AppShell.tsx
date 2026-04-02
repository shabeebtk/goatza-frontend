"use client";

/**
 * GOATZA — AppShell
 * Wraps protected pages with AppNav.
 * Adds correct top/bottom padding so content never hides under the bars.
 *
 * Usage in ProtectedLayout:
 *   import AppShell from "@/shared/components/layout/AppShell/AppShell"
 *   export default function ProtectedLayout({ children }) {
 *     return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>
 *   }
 */

import AppNav from "@/shared/components/layout/AppNav/AppNav";
import styles from "./AppShell.module.css";

interface AppShellProps {
    children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    return (
        <div className={styles.shell}>
            <AppNav />
            <main className={styles.content}>
                {children}
            </main>
        </div>
    );
}