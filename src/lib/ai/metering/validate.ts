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
/**
 * These write ai_invocations rows directly and expect the caller to supply
 * institutionId/walletId itself — the exact shape that let the turn route
 * silently omit them for text.chat_tutoring (dev-docs/ai-usage-metering-
 * phase3-plan.md's wallet-debit gap). Mirrors the eslint.config.mjs
 * restriction on the same module; this is the build-time backstop (§7.3).
 */
const RESTRICTED_RECORD_INVOCATION_NAMES = new Set([
  "startAiInvocation",
  "scheduleAiInvocationStart",
  "completeAiInvocation",
  "failAiInvocation",
  "scheduleFailAiInvocation",
]);

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

      if (source === "@/lib/ai/logging/recordInvocation") {
        const names = namedImportsFrom(clause);
        const restricted = names.filter((n) => RESTRICTED_RECORD_INVOCATION_NAMES.has(n));
        if (restricted.length > 0) {
          throw new Error(
            `AI usage metering: ${relPath} imports "${restricted.join(", ")}" from recordInvocation.ts outside ` +
              `src/lib/ai/gateway/**. These write ai_invocations rows directly and expect the caller to supply ` +
              `institutionId/walletId itself — use the resolveMeteredModel()/resolveMeteredSpeech() handle's ` +
              `startInvocation/completeInvocation/scheduleFailInvocation instead, which bind those fields for you ` +
              `(see dev-docs/ai-usage-metering-plan.md §7.2, §7.3).`,
          );
        }
      }
    }
  }
}

/**
 * Funnel-coverage build check — dev-docs/ai-usage-metering-phase2-plan.md §5
 * (D3). Every legitimate provider call already runs inside a
 * startAiInvocation/completeAiInvocation bracket, issued from one of a small,
 * closed set of files (the import boundary above confines every AI SDK /
 * speech-provider import to src/lib/ai/gateway/**). So "a future call escapes
 * the funnel" can only realistically happen by someone adding a new call site
 * inside one of those already-confined files and forgetting to bracket it —
 * a static, source-level property, not something that needs live network
 * traffic to detect.
 *
 * Pure pattern match, not a real call graph: it flags any occurrence of a
 * known AI-call shape (generateText(, streamObject(, the speech-provider
 * transcribe/synthesize/session-open calls) in a gateway file that isn't
 * accounted for in KNOWN_FUNNEL_CALL_SITES below. An unrecognized call shape
 * (a genuinely new pattern, not one of the ones listed here) is a documented
 * residual gap — see D3's "rejected/deferred alternative" in the plan.
 */
interface FunnelCallPattern {
  key: string;
  regex: RegExp;
  description: string;
}

const FUNNEL_CALL_PATTERNS: FunnelCallPattern[] = [
  { key: "generateText", regex: /\bgenerateText\s*\(/g, description: "AI SDK generateText() call" },
  { key: "streamObject", regex: /\bstreamObject\s*\(/g, description: "AI SDK streamObject() call" },
  { key: "provider.transcribe", regex: /\.transcribe\s*\(/g, description: "speech provider transcribe() call" },
  { key: "provider.synthesize", regex: /\.synthesize\s*\(/g, description: "speech provider synthesize() call" },
  {
    key: "cartesia.open",
    regex: /CartesiaTtsContinuationSession\.open\s*\(/g,
    description: "Cartesia WS TTS session open() call",
  },
  {
    key: "sarvam.open",
    regex: /SarvamTtsWebSocketSession\.open\s*\(/g,
    description: "Sarvam WS TTS session open() call",
  },
];

/** File paths relative to src/lib/ai/gateway/. Update when a new call site is added. */
const KNOWN_FUNNEL_CALL_SITES: Record<string, string[]> = {
  "structured.ts": ["generateText"],
  "turnStream.ts": ["streamObject"],
  "speech.ts": ["provider.transcribe", "provider.synthesize", "cartesia.open", "sarvam.open"],
};

export function assertFunnelCoverageComplete(): void {
  const gatewayRoot = path.join(process.cwd(), GATEWAY_DIR);
  const files = listSourceFiles(gatewayRoot);

  for (const file of files) {
    const relToGateway = path.relative(gatewayRoot, file).split(path.sep).join("/");
    const relToRoot = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, "utf8");
    const allowed = new Set(KNOWN_FUNNEL_CALL_SITES[relToGateway] ?? []);

    for (const pattern of FUNNEL_CALL_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content) && !allowed.has(pattern.key)) {
        throw new Error(
          `AI usage metering: ${relToRoot} contains an unregistered AI-call pattern ` +
            `(${pattern.description}). Every call site inside src/lib/ai/gateway/** must be ` +
            `wired through startAiInvocation/completeAiInvocation and added to ` +
            `KNOWN_FUNNEL_CALL_SITES in src/lib/ai/metering/validate.ts ` +
            `(dev-docs/ai-usage-metering-phase2-plan.md §5).`,
        );
      }
    }
  }
}
