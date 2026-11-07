import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The app's toast is the shared ToastProvider. No sonner <Toaster/> is mounted
  // outside the join flow, so a sonner toast anywhere else shows nothing at all.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/join/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "sonner",
          message: "No <Toaster/> is mounted outside features/join, so this toast would be silent. Use useToast() from @/shared/components/ui/Toast/Toast.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
