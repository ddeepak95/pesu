import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" },
      ],
    },
  },
  // Client-side reads of Supabase data must go through an SWR hook in
  // `src/hooks/swr/**`, not direct `@/lib/queries/*` imports. This keeps the
  // global loading overlay automatic (driven by SWR middleware) and avoids
  // per-component `useState`/`useEffect` loading state. Mutation imports
  // (`create*`, `update*`, `delete*`, `mark*`, `reset*`, `assign*`, etc.) are
  // not restricted; only read-style names (`get*`, `fetch*`, `list*`,
  // `find*`, `count*`, `is*`) are blocked. Server components and route
  // handlers under `src/app/**` (other than `*Client*`) and SWR hooks
  // themselves are exempt via the file globs.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*Client*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        // All legacy useEffect loaders have been migrated to SWR hooks under
        // `src/hooks/swr/**`. Genuinely imperative reads (event handlers,
        // session restore) go through `src/lib/swr/imperativeReads.ts`, which
        // also drives the global busy counter. Direct `@/lib/queries/*` reads
        // are now an error to prevent regressions.
        "error",
        {
          patterns: [
            {
              group: ["@/lib/queries/*", "@/lib/queries"],
              importNamePattern:
                "^(get|fetch|list|find|count|is[A-Z])",
              message:
                "Read Supabase data via an SWR hook in `src/hooks/swr/**` (or, for genuinely imperative event handlers, the tracked wrappers in `src/lib/swr/imperativeReads.ts`). Do not import read-style functions directly from `@/lib/queries`.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local python venvs / vendor files:
    "pesu-server/.venv/**",
    // Docusaurus generated artifacts:
    "convoed-docs/.docusaurus/**",
  ]),
]);

export default eslintConfig;
