/**
 * Build-gated exhaustiveness checks — dev-docs/ai-usage-metering-plan.md §7.3.
 * Consumed only by scripts/validate-ai-metering.ts (via `npm run prebuild`),
 * never imported from app code. Each assert throws on the first violation.
 */
import fs from "node:fs";
import path from "node:path";

export { assertCatalogUsageTypesComplete } from "@/lib/ai/metering/usageTypes";
export { assertRateCardComplete } from "@/lib/ai/metering/rates";

const GATEWAY_DIR = path.join("src", "lib", "ai", "gateway");
const ALLOWED_AI_IMPORT_NAMES = new Set(["jsonSchema"]);
const RESTRICTED_SPEECH_PATTERNS: RegExp[] = [
  /^@\/lib\/konvo-voice\/speech\/providers\//,
  /^@\/lib\/konvo-voice\/speech\/registry$/,
  /^@\/lib\/konvo-voice\/speech\/resolveProviderKey$/,
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Best-effort named-import extraction from an `import <clause> from "..."` clause. */
function namedImportsFrom(clause: string): string[] {
  const match = clause.match(/\{([^}]*)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

const IMPORT_STATEMENT_RE = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;

/**
 * Mirrors the eslint.config.mjs `@typescript-eslint/no-restricted-imports`
 * gateway-boundary rule (§7.2) as a build-time backstop — necessary because
 * `next build` doesn't run ESLint and this repo has no CI, so lint alone
 * gates nothing (§7.3).
 */
export function assertGatewayImportBoundaryHolds(): void {
  const srcRoot = path.join(process.cwd(), "src");
  const gatewayRoot = path.join(process.cwd(), GATEWAY_DIR) + path.sep;
  const files = listSourceFiles(srcRoot).filter((f) => !f.startsWith(gatewayRoot));

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    IMPORT_STATEMENT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_STATEMENT_RE.exec(content))) {
      const [, clause, source] = match;
      const relPath = path.relative(process.cwd(), file);

      if (source === "ai") {
        const names = namedImportsFrom(clause);
        const onlyAllowed = names.length > 0 && names.every((n) => ALLOWED_AI_IMPORT_NAMES.has(n));
        if (!onlyAllowed) {
          throw new Error(
            `AI usage metering: ${relPath} imports "ai" outside src/lib/ai/gateway/**. ` +
              `Only a resolveMeteredModel() handle may execute AI SDK calls ` +
              `(see dev-docs/ai-usage-metering-plan.md §7.2, §7.3).`,
          );
        }
      }

      if (RESTRICTED_SPEECH_PATTERNS.some((re) => re.test(source))) {
        throw new Error(
          `AI usage metering: ${relPath} imports "${source}" outside src/lib/ai/gateway/**. ` +
            `Speech provider client/key modules may only be imported inside the gateway — ` +
            `use resolveMeteredSpeech() instead (see dev-docs/ai-usage-metering-plan.md §7.2, §7.3).`,
        );
      }
    }
  }
}
