/**
 * Emits the SQL that seeds the 4 built-in activity types as
 * `owner_scope='system'` rows in `activity_templates` (Phase 1 of
 * dev-docs/activity-templates-plan.md, §6.4).
 *
 * The `definition` payloads are derived from the hardcoded registry
 * (`registryToDefinition`) so the seed can never drift from the built-ins at
 * authoring time. Run this to (re)generate the INSERT block, then paste the
 * output into the migration:
 *
 *   npx tsx scripts/generate-system-template-seed.ts
 *
 * The seed uses `ON CONFLICT (id) DO NOTHING` — insert-if-absent, never update
 * (super admins may edit system rows in-UI later; a re-run must not clobber
 * those edits). A brand-new built-in kind gets its own fixed UUID and is picked
 * up on the next run because that id is still absent.
 */
import { getActivityTypeDefinition, ACTIVITY_TYPE_KINDS } from "../src/lib/activityTypes/registry";
import {
  SYSTEM_TEMPLATE_IDS,
  registryToDefinition,
} from "../src/lib/activityTypes/templates";

/** Library blurb per built-in kind (system rows only; authored here, not in the registry). */
const DESCRIPTIONS: Record<string, string> = {
  learning:
    "Guided practice: the tutor helps the learner reason through a question step by step.",
  assessment:
    "Neutral evaluation: the interviewer probes understanding without coaching.",
  speaking_practice:
    "Conversational role-play for spoken-language practice; stays in character.",
  code_review:
    "Reviews a code submission against a rubric, showing code on screen.",
};

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function main(): void {
  const rows = ACTIVITY_TYPE_KINDS.map((kind) => {
    const def = getActivityTypeDefinition(kind);
    const id = SYSTEM_TEMPLATE_IDS[kind];
    const name = def.label;
    const description = DESCRIPTIONS[kind] ?? "";
    const definitionJson = JSON.stringify(registryToDefinition(kind));
    return (
      `  (${sqlString(id)}, ${sqlString(name)}, ${sqlString(description)}, ` +
      `${sqlString(definitionJson)}::jsonb, 'system', 'private', 'active')`
    );
  });

  const sql =
    `INSERT INTO public.activity_templates\n` +
    `  (id, name, description, definition, owner_scope, visibility, status)\n` +
    `VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT (id) DO NOTHING;\n`;

  process.stdout.write(sql);
}

main();
