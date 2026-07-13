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
  //
  // Same block also restricts direct `useRouter` imports from `next/navigation`
  // in client components; navigations must go through the tracked router so
  // they participate in the global loading overlay (via React's
  // `useTransition`). `usePathname`, `useSearchParams`, `useParams`, and other
  // exports from `next/navigation` are not restricted.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*Client*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        // All legacy useEffect loaders have been migrated to SWR hooks under
        // `src/hooks/swr/**`. Genuinely imperative reads (event handlers,
        // session restore) go through `src/lib/swr/imperativeReads.ts`, which
        // also drives the global busy counter. Direct `@/lib/queries/*` reads
        // and direct `useRouter` imports are now errors to prevent regressions.
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
          paths: [
            {
              name: "next/navigation",
              importNames: ["useRouter"],
              message:
                "Use `useTrackedRouter` from `@/hooks/useTrackedRouter` so navigations participate in the global loading overlay (via `useTransition`). Other exports from `next/navigation` (usePathname, useSearchParams, useParams, redirect, notFound) are still allowed.",
            },
          ],
        },
      ],
    },
  },
  // AI gateway import boundary — dev-docs/ai-usage-metering-plan.md §7.2.
  // Only src/lib/ai/gateway/** may import the `ai` package's execution
  // functions (generateText, streamObject, etc.) or the speech provider
  // client modules — both hold or exercise provider credentials, and the
  // gateway is the only place allowed to do that (metered handles are the
  // only capability the rest of the app may obtain). `jsonSchema` is a pure
  // schema helper with no execution/credential surface, so it's allowlisted
  // for the zod-schema-adjacent files that legitimately need it.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/lib/ai/gateway/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "ai",
              allowImportNames: ["jsonSchema"],
              allowTypeImports: true,
              message:
                "The `ai` package may only be imported inside src/lib/ai/gateway/** (dev-docs/ai-usage-metering-plan.md §7.2). Obtain a metered handle via resolveMeteredModel instead.",
            },
          ],
          patterns: [
            {
              group: [
                "@/lib/konvo-voice/speech/providers/**",
                "@/lib/konvo-voice/speech/registry",
                "@/lib/konvo-voice/speech/resolveProviderKey",
              ],
              allowTypeImports: true,
              message:
                "Speech provider client/key modules may only be imported inside src/lib/ai/gateway/** (dev-docs/ai-usage-metering-plan.md §7.2). Obtain a metered handle via resolveMeteredSpeech instead.",
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
